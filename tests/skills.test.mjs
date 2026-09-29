// 스킬에 딸린 스크립트 단위 테스트 (의존성 없음): node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHANNELS, withUtm, length, check } from '../skills/share/scripts/channels.mjs';
import { render } from '../skills/share/scripts/kit.mjs';
import { missingWords, describe } from '../skills/usertest/scripts/walk.mjs';

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
