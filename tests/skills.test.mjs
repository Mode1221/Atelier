// 스킬에 딸린 스크립트 단위 테스트 (의존성 없음): node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANNELS, withUtm, length, check } from '../skills/share/scripts/channels.mjs';
import { render } from '../skills/share/scripts/kit.mjs';
import { missingWords, describe } from '../skills/usertest/scripts/walk.mjs';
import { freePort, assertPortFree, testPort } from '../skills/build/templates/free-port.mjs';
import { createServer } from 'node:net';
import { d1Blocks, setDatabaseId, findUrl, deployFirst } from '../skills/build/templates/deploy-first.mjs';
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

test('share: 예시 프로젝트 홍보 글이 검사를 통과한다', () => {
  const spec = JSON.parse(readFileSync(new URL('../examples/beolgeum-jangbu/docs/share/posts.json', import.meta.url), 'utf8'));
  assert.deepEqual(check(spec), []);
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
  const plan = JSON.parse(readFileSync(new URL('../examples/beolgeum-jangbu/docs/usertest/plan.json', import.meta.url), 'utf8'));
  const ids = new Set(plan.tasks.map((t) => t.id));
  for (const p of plan.personas) for (const t of p.tasks ?? []) assert.ok(ids.has(t), `${p.id} → ${t}`);
  const ops = new Set(['goto', 'click', 'fill', 'check', 'select', 'see', 'notSee', 'url', 'openFrom']);
  for (const t of plan.tasks) for (const s of [...(t.setup ?? []), ...t.steps]) assert.ok(Object.keys(s).some((k) => ops.has(k)), JSON.stringify(s));
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

test('build 템플릿: 예시 프로젝트 사본이 원본과 같다', () => {
  for (const f of ['deploy-first.mjs', 'free-port.mjs']) assert.equal(readFileSync(`examples/beolgeum-jangbu/scripts/${f}`, 'utf8'), readFileSync(`skills/build/templates/${f}`, 'utf8'), f);
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
