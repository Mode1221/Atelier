// 스킬에 딸린 스크립트 단위 테스트 (의존성 없음): node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANNELS, withUtm, length, check } from '../skills/share/scripts/channels.mjs';
import { render, links } from '../skills/share/scripts/kit.mjs';
import { missingWords, describe } from '../skills/usertest/scripts/walk.mjs';
import { freePort, assertPortFree, testPort } from '../skills/build/templates/free-port.mjs';
import { createServer } from 'node:net';
import { d1Blocks, setDatabaseId, findUrl, deployFirst, secretSpecs } from '../skills/build/templates/deploy-first.mjs';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('share: utm 을 붙이고 기존 쿼리는 유지', () => {
  assert.equal(withUtm('https://a.dev/?ref=x', 'threads', 'beta'), 'https://a.dev/?ref=x&utm_source=threads&utm_medium=social&utm_campaign=beta');
});

test('share: X 는 한글을 2자로 센다', () => {
  assert.equal(length('가나a', 'x'), 5);
  assert.equal(length('가나a', 'threads'), 3);
});

test('share: 한도 초과·빈 글·모르는 채널을 잡는다', () => {
  const problems = check({ posts: [{ channel: 'x', text: '가'.repeat(200) }, { channel: 'threads', text: ' ' }, { channel: 'myspace', text: 'hi' }, { channel: 'band', text: 'ok' }] });
  assert.equal(problems.length, 3);
  assert.match(problems[0], /X .*한도 280/);
});

test('share: 모든 공유 주소는 https 공식 도메인', () => {
  for (const [id, ch] of Object.entries(CHANNELS)) {
    if (!ch.intent) continue;
    const u = new URL(ch.intent('글', 'https://a.dev/'));
    assert.equal(u.protocol, 'https:', id);
  }
});

test('share: 킷 HTML 은 글을 이스케이프하고 외부 스크립트가 없다', () => {
  const html = render({ product: 'P', url: 'https://a.dev/', posts: [{ channel: 'threads', text: '<script>x</script>' }, { channel: 'kakaotalk', text: '복사용' }] });
  assert.ok(!html.includes('<script>x</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('https://www.threads.net/intent/post?text='));
  assert.ok(!/<script src=/.test(html));
});

test('share: Threads 는 본문에 링크를 넣지 않고 첫 댓글용 링크를 따로 복사한다', () => {
  const intent = CHANNELS.threads.intent('글', 'https://a.dev/');
  assert.equal(decodeURIComponent(new URL(intent).searchParams.get('text')), '글');
  const html = render({ product: 'P', url: 'https://a.dev/', posts: [{ channel: 'threads', text: '본문' }, { channel: 'x', text: '짧게' }] });
  assert.ok(!html.includes('text=%EB%B3%B8%EB%AC%B8%0A'));
  assert.match(html, /<pre id="t0">본문<\/pre>/);
  assert.match(html, /첫 댓글에 넣을 링크: <code id="l0">https:\/\/a\.dev\/\?utm_source=threads/);
  assert.ok(html.includes('data-copy="l0">링크 복사'));
  assert.ok(!html.includes('data-copy="l1"'));
  assert.equal(check({ posts: [{ channel: 'threads', text: 'a'.repeat(500) }] }).length, 0);
});

const EXAMPLES = ['beolgeum-jangbu', 'chaenggim-pyo'];

test('share: 예시 프로젝트 홍보 글이 검사를 통과한다', () => {
  for (const ex of EXAMPLES) {
    const spec = JSON.parse(readFileSync(new URL(`../examples/${ex}/docs/share/posts.json`, import.meta.url), 'utf8'));
    assert.deepEqual(check(spec), [], ex);
  }
});

test('usertest: 기대 단어는 공백·대소문자를 무시하고 찾는다', () => {
  assert.deepEqual(missingWords(['모임 만들기', '입금', 'OK'], ['모임  만들기 버튼', 'ok']), ['입금']);
  assert.deepEqual(missingWords(undefined, ['x']), []);
});

test('usertest: 단계 설명', () => {
  assert.equal(describe({ click: { role: 'button', name: '저장' } }), 'click "저장"');
  assert.equal(describe({ see: '완료', within: { role: 'table', name: '정산' } }), 'see "완료" (정산 안)');
});

test('usertest: 예시 계획 파일 형식', () => {
  const ops = new Set(['goto', 'click', 'fill', 'check', 'select', 'see', 'notSee', 'url', 'openFrom']);
  for (const ex of EXAMPLES) {
    const plan = JSON.parse(readFileSync(new URL(`../examples/${ex}/docs/usertest/plan.json`, import.meta.url), 'utf8'));
    const ids = new Set(plan.tasks.map((t) => t.id));
    for (const p of plan.personas) for (const t of p.tasks ?? []) assert.ok(ids.has(t), `${ex} ${p.id} → ${t}`);
    for (const t of plan.tasks) for (const s of [...(t.setup ?? []), ...t.steps]) assert.ok(Object.keys(s).some((k) => ops.has(k)), JSON.stringify(s));
  }
});

import { buildRecord, postAll } from '../skills/share/scripts/post-bluesky.mjs';

test('bluesky: 링크 facet 는 UTF-8 바이트 위치', () => {
  const r = buildRecord('한글 글', 'https://a.dev/?x=1');
  const bytes = new TextEncoder().encode(r.text);
  const { byteStart, byteEnd } = r.facets[0].index;
  assert.equal(new TextDecoder().decode(bytes.slice(byteStart, byteEnd)), 'https://a.dev/?x=1');
});

test('bluesky: 키 없으면 건너뛰고, 이미 올린 글은 다시 안 올린다', async () => {
  const spec = { url: 'https://a.dev/', campaign: 'b', posts: [{ channel: 'bluesky', text: '첫 글' }, { channel: 'bluesky', text: '둘째 글' }, { channel: 'x', text: 'x' }] };
  assert.equal((await postAll(spec, { env: {}, log: () => {} })).skipped, true);
  const created = [];
  const fetchImpl = async (url, init) => {
    const u = new URL(url);
    if (u.pathname.endsWith('createSession')) return Response.json({ did: 'did:plc:me', accessJwt: 'jwt' });
    if (u.pathname.endsWith('getAuthorFeed')) return Response.json({ feed: [{ post: { record: { text: '첫 글\nhttps://a.dev/?utm_source=bluesky' } } }] });
    if (u.pathname.endsWith('createRecord')) {
      assert.equal(init.headers.authorization, 'Bearer jwt');
      created.push(JSON.parse(init.body).record.text);
      return Response.json({ uri: 'at://x' });
    }
    return new Response('', { status: 404 });
  };
  const r = await postAll(spec, { env: { BLUESKY_HANDLE: 'me', BLUESKY_APP_PASSWORD: 'pw' }, fetchImpl, log: () => {} });
  assert.equal(r.posted, 1);
  assert.match(created[0], /^둘째 글\nhttps:\/\/a\.dev\/\?utm_source=bluesky&utm_medium=social&utm_campaign=b$/);
});

const TOML = `name = "app"
[[d1_databases]]
binding = "DB"
database_name = "app"
database_id = "LOCAL_PLACEHOLDER"   # 배포 때 바뀜
migrations_dir = "migrations"

[triggers]
crons = ["0 0 * * *"]
`;
const UUID = '0b6c7e2e-1f7a-4a8e-9a57-2c1d3e4f5a6b';

test('deploy-first: wrangler.toml 의 D1 ID 를 바꾸고 다른 줄은 그대로', () => {
  assert.deepEqual(d1Blocks(TOML), [{ binding: 'DB', name: 'app', id: 'LOCAL_PLACEHOLDER' }]);
  const out = setDatabaseId(TOML, 'app', UUID);
  assert.equal(d1Blocks(out)[0].id, UUID);
  assert.ok(out.includes('[triggers]') && out.includes('migrations_dir = "migrations"'));
  assert.equal(setDatabaseId(TOML, 'other', UUID), TOML);
  assert.equal(findUrl('Uploaded app\n  https://app.me.workers.dev\nCurrent Version ID: x'), 'https://app.me.workers.dev');
});

function fakeWrangler({ loggedIn, dbExists }) {
  const calls = [];
  let exists = dbExists;
  const run = async (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'whoami') return { code: 0, out: loggedIn ? 'You are logged in' : 'You are not authenticated. Please run `wrangler login`.' };
    if (args[0] === 'login') { loggedIn = true; return { code: 0, out: '' }; }
    if (args[1] === 'list') return { code: 0, out: JSON.stringify(exists ? [{ name: 'app', uuid: UUID }] : []) };
    if (args[1] === 'create') { exists = true; return { code: 0, out: '' }; }
    if (args[0] === 'deploy') return { code: 0, out: 'Deployed app triggers\n  https://app.me.workers.dev\n' };
    return { code: 0, out: '' };
  };
  return { run, calls };
}

test('deploy-first: 처음이면 로그인·DB 생성·ID 기록·원격 마이그레이션·배포, 다시 돌려도 안전', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'df-')), 'wrangler.toml');
  writeFileSync(file, TOML);
  const first = fakeWrangler({ loggedIn: false, dbExists: false });
  assert.equal(await deployFirst({ run: first.run, file, log: () => {} }), 'https://app.me.workers.dev');
  assert.deepEqual(first.calls, ['whoami', 'login', 'd1 list --json', 'd1 create app', 'd1 list --json', 'd1 migrations apply DB --remote', 'deploy']);
  assert.equal(d1Blocks(readFileSync(file, 'utf8'))[0].id, UUID);

  const again = fakeWrangler({ loggedIn: true, dbExists: true });
  await deployFirst({ run: again.run, file, log: () => {} });
  assert.deepEqual(again.calls, ['whoami', 'd1 list --json', 'd1 migrations apply DB --remote', 'deploy']);
});

test('deploy-first: 실패하면 멈추고 배포하지 않는다', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'df-')), 'wrangler.toml');
  writeFileSync(file, TOML);
  const calls = [];
  const run = async (args) => { calls.push(args[0]); return args[1] === 'migrations' ? { code: 1, out: '' } : { code: 0, out: args[1] === 'list' ? JSON.stringify([{ name: 'app', uuid: UUID }]) : 'logged in' }; };
  await assert.rejects(deployFirst({ run, file, log: () => {} }), /마이그레이션 실패/);
  assert.ok(!calls.includes('deploy'));
});

test('deploy-first: 비밀값 — auto 는 만들어 로컬에 두고, 빈 값은 묻고, 있는 건 건너뛴다', async () => {
  assert.deepEqual(secretSpecs('# 설명\nFEEDBACK_TOKEN=auto\nSUPABASE_KEY=\nbad-name=x\n'), [{ name: 'FEEDBACK_TOKEN', auto: true }, { name: 'SUPABASE_KEY', auto: false }]);
  const dir = mkdtempSync(join(tmpdir(), 'df-'));
  writeFileSync(join(dir, 'wrangler.toml'), 'name = "app"\n');
  writeFileSync(join(dir, '.dev.vars.example'), 'FEEDBACK_TOKEN=auto\nSUPABASE_KEY=\nALREADY=\n');
  const puts = {};
  const run = async (args, opts = {}) => {
    if (args[0] === 'secret' && args[1] === 'list') return { code: 0, out: JSON.stringify([{ name: 'ALREADY', type: 'secret_text' }]) };
    if (args[0] === 'secret' && args[1] === 'put') { puts[args[2]] = opts.input; return { code: 0, out: '' }; }
    return { code: 0, out: args[0] === 'whoami' ? 'logged in' : '' };
  };
  const asked = [];
  const common = { run, file: join(dir, 'wrangler.toml'), log: () => {}, secretsFile: join(dir, '.atelier/secrets.json'), varsExample: join(dir, '.dev.vars.example') };
  await deployFirst({ ...common, ask: async (q) => { asked.push(q); return 'pasted-key'; } });
  assert.match(puts.FEEDBACK_TOKEN, /^[0-9a-f]{64}$/);
  assert.equal(puts.SUPABASE_KEY, 'pasted-key');
  assert.ok(!('ALREADY' in puts));
  assert.equal(asked.length, 1);
  const local = JSON.parse(readFileSync(join(dir, '.atelier/secrets.json'), 'utf8'));
  assert.equal(local.FEEDBACK_TOKEN, puts.FEEDBACK_TOKEN);
  assert.ok(!('SUPABASE_KEY' in local), '붙여 넣은 값은 로컬에 남기지 않음');
  assert.match(readFileSync(join(dir, '.gitignore'), 'utf8'), /^\.atelier\/$/m);
});

test('build 템플릿: 예시 프로젝트 사본이 원본과 같다', () => {
  for (const f of ['build/templates/deploy-first.mjs', 'build/templates/free-port.mjs', 'beta/templates/feedback-pull.mjs', 'operate/templates/backup.mjs']) {
    const name = f.split('/').pop();
    for (const ex of EXAMPLES) assert.equal(readFileSync(`examples/${ex}/scripts/${name}`, 'utf8'), readFileSync(`skills/${f}`, 'utf8'), `${ex} ${name}`);
  }
  for (const ex of EXAMPLES)
    for (const f of ['worker.js', 'setup.mjs']) assert.equal(readFileSync(`examples/${ex}/ops/watchdog/${f}`, 'utf8'), readFileSync(`skills/operate/templates/watchdog/${f}`, 'utf8'), `${ex} ${f}`);
});

test('free-port: 빈 포트를 고르고, 쓰이는 포트는 이유와 함께 거절한다', async () => {
  const p = await freePort();
  assert.ok(p > 0 && p < 65536);
  assert.equal(await testPort(undefined) > 0, true);
  const busy = createServer();
  await new Promise((r) => busy.listen(0, '127.0.0.1', r));
  const { port } = busy.address();
  try {
    await assert.rejects(assertPortFree(port), /이미 다른 프로그램이 쓰고/);
    await assert.rejects(testPort(String(port)), /포트 \d+ 를/);
  } finally { busy.close(); }
});

test('share: 로컬 모드 대화창용 링크 — 공유 창, 복사 안내, Threads 첫 댓글', () => {
  const t = links({ url: 'https://a.dev/', campaign: 'beta', posts: [{ channel: 'x', text: '짧게' }, { channel: 'everytime', text: '음슴체' }, { channel: 'threads', text: '제작기' }] });
  assert.match(t, /1\. X \(트위터\)[\s\S]*→ 올리기: https:\/\/x\.com\/intent\/post\?/);
  assert.match(t, /2\. 에브리타임[\s\S]*공유 창이 없어요/);
  assert.match(t, /3\. Threads[\s\S]*첫 댓글에 넣을 링크: https:\/\/a\.dev\/\?utm_source=threads/);
  assert.ok(!/│ https:\/\/a\.dev\/\?utm_source=threads/.test(t), 'Threads 본문에는 링크 없음');
});

// 참고 파일은 어느 단계에서든 읽혀야 한다 — 만들어 놓고 아무 SKILL.md 도 가리키지 않는 파일을 막는다.
test('skills: 모든 참고 파일은 SKILL.md 에서 연결돼 있다', async () => {
  const { readdirSync, statSync } = await import('node:fs');
  const root = new URL('../skills/', import.meta.url).pathname;
  const skills = readdirSync(root).filter((d) => statSync(join(root, d)).isDirectory());
  const text = skills.map((s) => { try { return readFileSync(join(root, s, 'SKILL.md'), 'utf8'); } catch { return ''; } }).join('\n');
  const walk = (dir) => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
  const orphans = [];
  for (const s of skills) {
    const refs = join(root, s, 'references');
    let files = [];
    try { files = walk(refs).filter((f) => f.endsWith('.md')); } catch { continue; }
    for (const f of files) {
      const rel = f.slice(refs.length + 1);
      const dir = rel.includes('/') ? rel.slice(0, rel.lastIndexOf('/') + 1) : null;
      const linked = text.includes(`references/${rel}`) || (dir && (text.includes(`references/${dir}*`) || text.includes(`references/${dir}<`)));
      if (!linked) orphans.push(`${s}/references/${rel}`);
    }
  }
  assert.deepEqual(orphans, []);
});

test('share: 리워드 글은 대가·조건이 본문에 있어야 하고, 참여자 후기 표시 문구가 킷에 나온다', async () => {
  const { disclosureLine } = await import('../skills/share/scripts/channels.mjs');
  const bad = check({ posts: [{ channel: 'threads', text: '후기 남겨 주세요', reward: '커피 쿠폰' }] });
  assert.equal(bad.length, 2);
  assert.deepEqual(check({ posts: [{ channel: 'threads', text: '써 보고 후기를 남기면 5명께 커피 쿠폰을 드려요', reward: '커피 쿠폰' }] }), []);
  const hidden = check({ posts: [{ channel: 'x', text: '후기 쓰면 기프티콘 증정!' }] });
  assert.match(hidden[0], /reward/);
  assert.deepEqual(check({ posts: [{ channel: 'x', text: '둘이 갈 코스를 추천해 드려요' }] }), []);
  const html = render({ product: 'P', url: 'https://a.dev/', posts: [{ channel: 'x', text: '후기를 남기면 커피 쿠폰', reward: '커피 쿠폰' }] });
  assert.ok(html.includes(disclosureLine('커피 쿠폰')));
});
