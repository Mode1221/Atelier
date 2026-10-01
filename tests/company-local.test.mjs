// company 로컬 모드 파일 규칙 (skills/company/scripts/local.mjs)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { init, write, read, docPath, pending, decide, humanDone, setEnabled, runOrder, brief, briefText, check, services, pickService, workId, now, cli } from '../skills/company/scripts/local.mjs';

const T = new Date('2026-09-30T00:05:00.123Z');
const fresh = () => mkdtempSync(join(tmpdir(), 'co-'));

test('local: init 은 service.json 과 폴더를 만들고 다시 실행해도 값을 지키며 기본 부서는 대표실·고객지원·마케팅·데이터재무', () => {
  const root = fresh();
  init(root, 'timer', { name: '스터디 타이머' }, T);
  const svc = JSON.parse(readFileSync(join(root, 'company/timer/service.json'), 'utf8'));
  assert.deepEqual(svc.enabled, ['ceo', 'support', 'marketing', 'data']);
  assert.equal(svc.createdAt, '2026-09-30T00:05:00Z');
  assert.ok(existsSync(join(root, 'company/timer/approvals')));
  init(root, 'timer', { url: 'https://t.dev' });
  const again = read(root, 'timer', null);
  assert.equal(again.name, '스터디 타이머');
  assert.equal(again.url, 'https://t.dev');
  assert.equal(again.createdAt, '2026-09-30T00:05:00Z');
});

test('local: 경로 규칙 — 서비스 ID·컬렉션·문서 id 검사, 폴더 밖 거절', () => {
  const root = fresh();
  assert.throws(() => docPath(root, '../x', 'tasks', 'a'), /서비스 ID/);
  assert.throws(() => docPath(root, 'a', 'secrets', 'a'), /모르는 컬렉션/);
  assert.throws(() => docPath(root, 'a', 'tasks', '../../etc'), /형식/);
  assert.equal(docPath(root, 'a', 'plan', 'roadmap'), join(root, 'company/a/plan/roadmap.json'));
  assert.equal(workId('ceo', 'beta-post', T), 'ceo-20260930-beta-post');
  assert.equal(now(T), '2026-09-30T00:05:00Z');
});

test('local: 결재 번호는 올라온 순서, 승인·반려를 반영하고 쉬운 말로 결과를 준다', () => {
  const root = fresh();
  init(root, 's', { name: 'S' }, T);
  write(root, 's', 'approvals', 'marketing-20260930-b', { dept: 'marketing', title: '스레드 글 올리기', kind: '외부 게시', status: 'pending', ifApprove: '대표님이 올리기 버튼을 누를 수 있게 준비해요', ifReject: '글을 고쳐 다시 올려요', createdAt: '2026-09-30T01:00:00Z' });
  write(root, 's', 'approvals', 'dev-20260930-a', { dept: 'dev', title: '버그 수정 배포', kind: '배포', status: 'pending', ifApprove: '고친 버전이 운영에 나가요', createdAt: '2026-09-30T00:10:00Z' });
  write(root, 's', 'approvals', 'dev-20260929-old', { dept: 'dev', title: '끝난 것', status: 'approved', createdAt: '2026-09-29T00:00:00Z' });
  assert.deepEqual(pending(root, 's').map((a) => a.id), ['dev-20260930-a', 'marketing-20260930-b']);

  const msg = decide(root, 's', 1, 'approve', '', T);
  assert.match(msg, /승인했어요: 버그 수정 배포/);
  assert.match(msg, /고친 버전이 운영에 나가요/);
  const a = read(root, 's', 'approvals', 'dev-20260930-a');
  assert.equal(a.status, 'approved');
  assert.equal(a.decidedAt, '2026-09-30T00:05:00Z');
  assert.equal(a.id, undefined, 'id 는 파일 이름에만');

  assert.throws(() => decide(root, 's', 1, 'reject', ''), /이유/);
  assert.match(decide(root, 's', 1, 'reject', '문구가 과장돼요'), /반려했어요[\s\S]*문구가 과장돼요[\s\S]*글을 고쳐/);
  assert.equal(read(root, 's', 'approvals', 'marketing-20260930-b').reason, '문구가 과장돼요');
  assert.throws(() => decide(root, 's', 1, 'approve'), /1번 결재가 없어요/);

  // 여러 건을 한 번에: id 로 고르면 번호가 당겨져도 안전
  write(root, 's', 'approvals', 'dev-20260930-c', { dept: 'dev', title: 'C', status: 'pending', createdAt: '2026-09-30T02:00:00Z' });
  write(root, 's', 'approvals', 'dev-20260930-d', { dept: 'dev', title: 'D', status: 'pending', createdAt: '2026-09-30T03:00:00Z' });
  decide(root, 's', 'dev-20260930-c', 'approve');
  decide(root, 's', 'dev-20260930-d', 'reject', '나중에');
  assert.equal(read(root, 's', 'approvals', 'dev-20260930-d').status, 'rejected');
});

test('local: 대표 할 일 완료, 부서 켜기·끄기, all 실행 순서는 대표실 먼저', () => {
  const root = fresh();
  init(root, 's', {}, T);
  write(root, 's', 'human', 'marketing-20260930-post', { text: 'Threads 올리기', done: false, createdAt: '2026-09-30T00:00:00Z' });
  assert.match(humanDone(root, 's', 1), /Threads 올리기/);
  assert.equal(read(root, 's', 'human', 'marketing-20260930-post').done, true);

  assert.deepEqual(runOrder(root, 's', 'all'), ['ceo', 'marketing', 'support', 'data']);
  assert.match(setEnabled(root, 's', 'dev', true), /사용량/);
  setEnabled(root, 's', 'ceo', false);
  assert.deepEqual(read(root, 's', null).enabled, ['dev', 'marketing', 'support', 'data']);
  assert.deepEqual(runOrder(root, 's', 'all'), ['dev', 'marketing', 'support', 'data']);
  setEnabled(root, 's', 'ceo', true);
  assert.equal(runOrder(root, 's', 'all')[0], 'ceo');
  assert.deepEqual(runOrder(root, 's', 'qa'), ['qa']);
  assert.throws(() => setEnabled(root, 's', 'hr', true), /모르는 부서/);
});

test('local: 브리핑에 결재 번호·대표 할 일·부서 상태, 꺼진 부서의 멈춘 일을 알린다', () => {
  const root = fresh();
  init(root, 's', { name: '벌금장부', url: 'https://b.dev' }, T);
  write(root, 's', 'reports', 'ceo', { level: 'good', summary: '오늘 할 일 3개를 나눴어요', at: '2026-09-30T00:00:00Z' });
  write(root, 's', 'plan', 'roadmap', { focus: '베타 사용자 모으기', goals: [{ text: '주간 모임', current: null, target: 10, unit: '개' }] });
  write(root, 's', 'approvals', 'marketing-20260930-a', { dept: 'marketing', title: '글 올리기', kind: '외부 게시', status: 'pending', ifApprove: '올려요', createdAt: '2026-09-30T00:00:00Z' });
  write(root, 's', 'tasks', 'qa-20260930-x', { dept: 'qa', title: '확인', status: 'todo' });
  const b = brief(root, 's', T);
  assert.equal(b.approvals[0].n, 1);
  const txt = briefText(b);
  assert.match(txt, /오늘 할 일 3개를 나눴어요/);
  assert.match(txt, /1\. \[마케팅·외부 게시\] 글 올리기/);
  assert.match(txt, /"1번 승인"/);
  assert.match(txt, /주간 모임: 측정 없음 \/ 10개/);
  assert.match(txt, /꺼진 부서에 할 일이 있어요: QA/);
});

test('local: 형식 검사 — id 규칙, 상태, 시각, 채널 ID, 본문 링크', () => {
  const root = fresh();
  init(root, 's', {}, T);
  assert.deepEqual(check(root, 's'), []);
  write(root, 's', 'tasks', 'todo1', { dept: 'dev', status: 'later', createdAt: '2026-09-30 09:00' });
  write(root, 's', 'share', 'posts', { posts: [{ channel: 'Threads', text: '보세요 https://b.dev' }] });
  const p = check(root, 's').join('\n');
  assert.match(p, /tasks\/todo1: id 는/);
  assert.match(p, /status "later"/);
  assert.match(p, /createdAt 는 date -u/);
  assert.match(p, /channel 은 ID/);
  assert.match(p, /링크를 넣지 않아요/);
});

test('local: 서비스가 여럿이면 ID 를 묻고, 명령줄은 서비스 ID 생략을 받아 준다', () => {
  const root = fresh();
  init(root, 'a', { name: 'A' }, T);
  assert.equal(pickService(root), 'a');
  assert.match(cli(['brief'], root), /■ A/);
  init(root, 'b', { name: 'B' }, T);
  assert.deepEqual(services(root).map((s) => s.id), ['a', 'b']);
  assert.throws(() => pickService(root), /여럿/);
  assert.match(cli(['brief', 'b'], root), /■ B/);
  assert.equal(cli(['order', 'a', 'all'], root), 'ceo marketing support data');
});

// 클라우드 본부 절차 동기화 (skills/company/scripts/playbook.mjs)
import { build as pbBuild, diff as pbDiff, sources as pbSources, hash as pbHash, cli as pbCli } from '../skills/company/scripts/playbook.mjs';

test('playbook: 공통 절차 4개 + 부서 10개, 문서마다 원본·지문·버전', () => {
  const docs = pbBuild();
  const names = docs.map((d) => d.name);
  for (const n of ['cloud-run', 'planning', 'stages', 'channels', 'dept-ceo', 'dept-ops', 'dept-support']) assert.ok(names.includes(n), n);
  assert.equal(names.filter((n) => n.startsWith('dept-')).length, 10);
  const run = docs.find((d) => d.name === 'cloud-run').doc;
  assert.match(run.source, /skills\/company\/references\/cloud-run\.md$/);
  assert.equal(run.hash, pbHash(run.text));
  assert.match(run.atelier, /^\d+\.\d+\.\d+$/);
  assert.equal(Object.keys(pbSources()).length, docs.length);
});

test('playbook: check 는 없음·다름만 알리고 hash 없는 옛 문서는 본문으로 비교', () => {
  const docs = pbBuild();
  const remote = Object.fromEntries(docs.map(({ name, doc }) => [name, { text: doc.text }]));
  assert.deepEqual(pbDiff(docs, remote), []);
  remote.planning = { text: '옛 절차' };
  delete remote['dept-qa'];
  assert.deepEqual(pbDiff(docs, remote), [{ name: 'planning', why: '스킬 문서와 다름' }, { name: 'dept-qa', why: '본부에 없음' }]);
});

test('playbook: build 는 파일과 batch writes 를 만들고 check 는 그 결과를 최신으로 본다', () => {
  const dir = fresh();
  const lines = [];
  assert.equal(pbCli(['build', dir], (x) => lines.push(x)), 0);
  const writes = JSON.parse(readFileSync(join(dir, 'writes.json'), 'utf8'));
  assert.ok(writes.every((w) => w.op === 'set' && w.collection === 'playbook' && existsSync(w.file_path)));
  assert.equal(pbCli(['check', dir], (x) => lines.push(x)), 0);
  assert.equal(pbCli(['check', fresh()], () => {}), 1);
  assert.equal(pbCli([], () => {}), 2);
});
