// 클라우드 본부(skills/company/cloud/hq.html) 실사용 테스트.
// claude.ai 런타임(db·user·mcp)을 메모리 가짜로 바꿔 서비스 3개를 운영하는 대표의 하루를 그대로 밟는다.
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';

const HTML = readFileSync(new URL('../../skills/company/cloud/hq.html', import.meta.url), 'utf8');
const PAGE = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${HTML}</body></html>`;

const H = (h) => new Date(Date.now() - h * 3600e3).toISOString();
const SEED = {
  'companies/beolgeum': { name: '벌금장부', stage: 'operate', url: 'https://beolgeum.example.dev', routines: { ops: 'trig_b_ops', support: 'trig_b_sup' } },
  'companies/beolgeum/reports/ops': { level: 'critical', summary: '결제 확인 페이지가 30분째 500 오류를 내요.', at: H(0.5) },
  'companies/beolgeum/reports/support': { level: 'good', summary: '문의 2건 답변 완료.', at: H(3) },
  'companies/beolgeum/approvals/a1': { title: '도메인 1년 등록', dept: 'ops', kind: '비용', cost: '월 1,500원', detail: 'workers.dev 대신 전용 주소를 씁니다.', ifApprove: '오늘 등록하고 주소를 바꿔요', ifReject: '임시 주소를 계속 써요', status: 'pending', createdAt: H(2) },
  'companies/beolgeum/metrics/main': { items: { '주간 사용자': 41, '가입': 7, '오류율': '0.4%' }, at: H(1) },
  'companies/chaenggim': { name: '챙김표', stage: 'grow', url: 'https://chaenggim.example.dev', routines: { ceo: 'trig_c_ceo', marketing: 'trig_c_mkt' } },
  'companies/chaenggim/reports/qa': { level: 'warning', summary: '모바일 사파리에서 목록 정렬이 가끔 늦어요.', at: H(5) },
  'companies/chaenggim/approvals/a2': { title: 'Threads 홍보 글 게시', dept: 'marketing', kind: '공개 게시', status: 'pending', createdAt: H(4) },
  'companies/chaenggim/human/h1': { text: '카카오 개발자 콘솔에서 도메인 등록', why: '공유 미리보기가 안 떠요', link: 'https://developers.kakao.com', done: false, createdAt: H(6) },
  'companies/chaenggim/feedback/2026-09-30': { date: '2026-09-30', status: 'new', count: 2, items: [{ kind: 'hard', message: '품목 삭제가 어디 있는지 모르겠어요' }, { kind: 'good', message: '캠핑 갈 때 잘 썼어요' }] },
  'companies/chaenggim/metrics/main': { items: { '주간 사용자': 128, '새 목록': 23, '재방문': '31%' }, at: H(2) },
  'companies/chaenggim/metrics/daily': {
    at: H(3),
    series: { visitors: '방문자', views: '페이지 열람', created: '목록 만들기', joined: '참여(이름 추가)', expenses: '정산 기록' },
    days: Array.from({ length: 14 }, (_, i) => ({ date: new Date(Date.now() - (13 - i) * 864e5).toISOString().slice(0, 10), visitors: 10 + i, views: 20 + 2 * i, created: i % 3, joined: i, expenses: i % 2 })),
    sources: { direct: 40, threads: 25, kakaotalk: 12 },
  },
  'companies/chaenggim/plan/roadmap': { focus: '첫 목록을 만든 사람이 친구를 부르게 하기', stage: 'grow', updatedAt: H(20), goals: [{ text: '초대 수락률', metric: '수락', current: 12, target: 30, unit: '%' }], items: [{ title: '초대 링크 미리보기', status: 'now', dept: 'dev' }, { title: '도메인 등록', status: 'now', dept: 'human' }] },
  'companies/chaenggim/share/posts': { url: 'https://chaenggim.example.dev', campaign: 'launch', posts: [{ channel: 'threads', text: '캠핑 준비물, 누가 뭘 챙길지 링크 하나로.' }, { channel: 'x', text: '준비물 분담표를 만들었어요.' }] },
  'companies/chaenggim/tasks/t1': { title: '초대 링크 미리보기 이미지', dept: 'dev', status: 'doing', updatedAt: H(1) },
  'companies/picknus': { name: '픽앤어스', stage: 'operate', url: 'https://picknus.example.dev' },
  'companies/picknus/reports/ops': { level: 'good', summary: '응답 시간 정상, 오류 없음.', at: H(1) },
  'companies/picknus/metrics/main': { items: { '주간 사용자': 312, '코스 생성': 95 }, at: H(1) },
};
const TRIGGERS = [
  { id: 'trig_b_ops', enabled: true, cron_expression: '34 */3 * * *', last_run: { status: 'ROUTINE_RUN_STATUS_SUCCEEDED', fired_at: H(1) } },
  { id: 'trig_b_sup', enabled: false, cron_expression: 'CRON_TZ=Asia/Seoul 30 18 * * 1-5' },
  { id: 'trig_c_ceo', enabled: true, cron_expression: 'CRON_TZ=Asia/Seoul 0 8 * * *' },
  { id: 'trig_c_mkt', enabled: true, cron_expression: 'CRON_TZ=Asia/Seoul 0 12 * * 1,4' },
];

// claude.ai 런타임 가짜: 경로 → 문서, 쓰기마다 모든 구독에 새 스냅샷
function fakeRuntime({ seed, triggers, canWrite }) {
  const store = new Map(Object.entries(seed));
  const subs = new Set();
  let seq = 0;
  window.__calls = [];
  window.__store = store;
  const snapDoc = (path) => ({ id: path.split('/').pop(), exists: store.has(path), data: () => structuredClone(store.get(path)) });
  const query = (path, order, lim) => ({
    orderBy: (k, dir) => query(path, [k, dir], lim),
    limit: (n) => query(path, order, n),
    where: () => query(path, order, lim),
    run() {
      let docs = [...store.keys()].filter((k) => k.startsWith(path + '/') && !k.slice(path.length + 1).includes('/')).map(snapDoc);
      if (order) docs.sort((a, b) => String(a.data()[order[0]] ?? '').localeCompare(String(b.data()[order[0]] ?? '')) * (order[1] === 'desc' ? -1 : 1));
      if (lim) docs = docs.slice(0, lim);
      return { docs, size: docs.length };
    },
    get: async function () { return this.run(); },
    onSnapshot(cb) { const s = () => cb(this.run()); subs.add(s); setTimeout(s, 10); return () => subs.delete(s); },
    add: async (data) => { const id = `n${++seq}`; store.set(`${path}/${id}`, data); notify(); return { id }; },
  });
  const notify = () => setTimeout(() => subs.forEach((s) => s()), 10);
  const doc = (path) => ({
    get: async () => snapDoc(path),
    onSnapshot(cb) { const s = () => cb(snapDoc(path)); subs.add(s); setTimeout(s, 10); return () => subs.delete(s); },
    update: async (data) => { if (!canWrite) throw Object.assign(new Error('denied'), { code: 'invalid_argument' }); store.set(path, { ...store.get(path), ...data }); notify(); },
    set: async (data) => { store.set(path, data); notify(); },
  });
  window.__write = (path, data) => { store.set(path, data); notify(); };
  const db = { collection: (p) => query(p), doc };
  const mcp = {
    async callTool(server, tool, args) {
      window.__calls.push({ server, tool, args });
      if (tool === 'list_triggers') { const i = args.cursor ? 2 : 0; return { payload: { data: triggers.slice(i, i + 2), has_more: !args.cursor, next_cursor: args.cursor ? '' : 'p2' } }; }
      if (tool === 'update_trigger') { const t = triggers.find((x) => x.id === args.trigger_id); t.enabled = args.enabled; }
      return { payload: {} };
    },
  };
  window.claude = { use: async (c) => ({ db, mcp, user: { can: async () => canWrite } })[c] };
}

async function open(page, { canWrite = true, hash = '', seed = SEED } = {}) {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/cloud-hq', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.addInitScript(fakeRuntime, { seed, triggers: structuredClone(TRIGGERS), canWrite });
  await page.goto('/cloud-hq' + hash);
}
const calls = (page) => page.evaluate(() => window.__calls);
const stored = (page, path) => page.evaluate((p) => window.__store.get(p), path);
// 모바일에서 넓은 요소가 있으면 브라우저가 화면을 축소해 innerWidth 가 커진다 — 기기 폭과 비교
const noHScroll = async (page) => { const w = page.viewportSize().width; expect(await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth])).toEqual([w, w]); };

test('대표의 하루: 전체 화면에서 세 서비스의 급한 일을 한 번에 처리', async ({ page }) => {
  await open(page);
  const main = page.getByRole('main');
  await expect(main.getByText('문제가 있는 서비스 1개')).toBeVisible();

  // 할 일함은 문제 보고 → 결재 → 대표 할 일 → 새 의견 순, 항목마다 서비스 이름
  const items = main.locator('.inbox > li');
  await expect(items).toHaveCount(5);
  await expect(items.nth(0)).toContainText('운영 부서가 문제를 보고했어요');
  await expect(items.nth(0)).toContainText('벌금장부');
  await expect(items.nth(1)).toHaveAttribute('data-kind', 'approval');
  await expect(items.nth(3)).toContainText('카카오 개발자 콘솔');
  await expect(items.nth(4)).toContainText('정리 전 사용자 의견 2건');

  // 왼쪽 목록: 서비스별 확인 수
  const nav = page.getByRole('navigation', { name: '서비스 목록' });
  await expect(nav.getByRole('button', { name: /전체.*4건/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /챙김표.*2건/ })).toBeVisible();
  await expect(nav.getByRole('button', { name: /픽앤어스/ })).not.toContainText('건');

  // 결재 승인 → 부서를 바로 깨운다
  await main.getByRole('button', { name: '승인: 도메인 1년 등록' }).click();
  await expect(page.getByRole('status').filter({ hasText: '운영 부서가 지금 진행해요' })).toBeVisible();
  expect((await stored(page, 'companies/beolgeum/approvals/a1')).status).toBe('approved');
  expect((await calls(page)).find((c) => c.tool === 'fire_trigger').args.trigger_id).toBe('trig_b_ops');

  // 반려 이유를 쓰는 중에 실시간 보고가 들어와도 글이 남아 있다
  const rej = items.filter({ hasText: 'Threads 홍보 글 게시' });
  await rej.getByText('반려하기').click();
  const reason = rej.getByLabel(/반려 이유/);
  await reason.fill('문구에 과장이 있어요');
  await page.evaluate(() => window.__write('companies/picknus/reports/qa', { level: 'good', summary: '회귀 없음', at: new Date().toISOString() }));
  await expect(main.getByText('회귀 없음')).toHaveCount(0); // 전체 화면엔 보고 본문이 없다 — 다시 그려진 뒤 확인
  await page.waitForTimeout(100);
  await expect(reason).toHaveValue('문구에 과장이 있어요');
  await expect(reason).toBeFocused();
  await reason.pressSequentially(', 수치 근거 붙여 주세요');
  await rej.getByRole('button', { name: '반려' }).click();
  await expect(page.getByRole('status').filter({ hasText: '반려했어요' })).toBeVisible();
  const a2 = await stored(page, 'companies/chaenggim/approvals/a2');
  expect(a2).toMatchObject({ status: 'rejected', reason: '문구에 과장이 있어요, 수치 근거 붙여 주세요' });

  // 대표 할 일 끝
  await main.getByRole('button', { name: /했어요: 카카오/ }).click();
  await expect(main.getByText('카카오 개발자 콘솔에서 도메인 등록')).toHaveCount(0);
  expect((await stored(page, 'companies/chaenggim/human/h1')).done).toBe(true);
  await expect(nav.getByRole('button', { name: /전체.*1건/ })).toBeVisible();

  // 서비스 카드: 숫자와 상태
  const card = main.locator('.svc-card').filter({ hasText: '픽앤어스' });
  await expect(card).toContainText('312');
  await expect(card).toContainText('정상');
  await noHScroll(page);

  // 새 의견 → 그 서비스 상세의 의견 칸으로
  await main.getByRole('button', { name: '의견 보기' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '챙김표' })).toBeVisible();
  await expect(page).toHaveURL(/#s=chaenggim/);
  await expect(main.getByText('품목 삭제가 어디 있는지 모르겠어요')).toBeVisible();
});

test('서비스 상세: 목표·숫자·보고·홍보·일 맡기기·부서 켜고 끄기', async ({ page }) => {
  await open(page, { hash: '#s=chaenggim' });
  const main = page.getByRole('main');
  await expect(page.getByRole('heading', { level: 1, name: '챙김표' })).toBeVisible();
  await expect(main.getByText('첫 목록을 만든 사람이 친구를 부르게 하기')).toBeVisible();
  await expect(main.getByRole('progressbar', { name: /초대 수락률 12\/30/ })).toBeVisible();
  await expect(main.getByText('모바일 사파리에서 목록 정렬이 가끔 늦어요.')).toBeVisible();
  await expect(main.getByText('128')).toBeVisible();

  // 홍보: 올린 글은 목록에서 빠진다
  await expect(main.getByText('0/2 올림')).toBeVisible();
  await expect(main.getByRole('link', { name: 'Threads에 올리기' })).toHaveAttribute('href', /threads\.net\/intent/);
  await main.getByRole('button', { name: '올렸어요' }).first().click();
  await expect(main.getByText('1/2 올림')).toBeVisible();

  // 잘 안 쓰는 것은 "더 보기" 안에
  await expect(main.getByLabel('무엇을 해야 하나요?')).toBeHidden();
  await main.getByText(/더 보기/).click();
  await expect(main.getByText('초대 링크 미리보기 이미지')).toBeVisible();
  await main.getByLabel('무엇을 해야 하나요?').fill('첫 화면에 사용 후기 넣기');
  await main.getByLabel('누구에게').selectOption('marketing');
  await main.getByLabel('지금 바로 일하게 하기').check();
  await main.getByRole('button', { name: '맡기기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '마케팅 부서가 지금 일을 시작해요' })).toBeVisible();
  await expect(main.getByText('첫 화면에 사용 후기 넣기')).toBeVisible();
  expect((await calls(page)).filter((c) => c.tool === 'fire_trigger').pop().args.trigger_id).toBe('trig_c_mkt');

  // 부서 일정: 사람이 읽는 시간, 끄기
  const mkt = main.locator('details.more li.item').filter({ hasText: '월·목 12:00' });
  await expect(mkt).toContainText('마케팅');
  await mkt.getByRole('button', { name: '끄기' }).click();
  await expect(page.getByRole('status').filter({ hasText: '마케팅 부서를 껐어요' })).toBeVisible();
  await expect(mkt.getByRole('button', { name: '켜기' })).toBeVisible();
  expect(await main.locator('details.more').evaluate((d) => d.open)).toBe(true); // 다시 그려도 펼친 채
  await noHScroll(page);

  // 다른 서비스: N시간마다 일정, 두 번째 쪽에 있던 예약도 찾는다
  await page.getByRole('navigation', { name: '서비스 목록' }).getByRole('button', { name: /벌금장부/ }).click();
  await main.getByText(/더 보기/).click();
  await expect(main.getByText(/3시간마다 \(34분\) · 마지막 1시간 전 끝냄/)).toBeVisible();
  await expect(main.locator('details.more li.item').filter({ hasText: '고객지원' })).toContainText('꺼짐');
  await main.getByRole('button', { name: '← 전체 서비스' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '전체 서비스' })).toBeVisible();
});

test('부서가 켜져 있는데 보고가 이틀 넘게 없으면 할 일함에 멈춤을 알린다', async ({ page }) => {
  await open(page, { seed: { ...SEED, 'companies/timer': { name: '스터디 타이머', routines: { ceo: 'trig_c_ceo' } }, 'companies/timer/reports/ceo': { level: 'good', summary: '계획 세움', at: H(80) } } });
  const main = page.getByRole('main');
  const item = main.locator('.inbox > li[data-kind="stale"]');
  await expect(item).toContainText('부서 보고가 3일째 없어요');
  await expect(item).toContainText('스터디 타이머');
  await expect(main.locator('.inbox > li').nth(1)).toHaveAttribute('data-kind', 'stale'); // 문제 보고 바로 다음
  await item.getByRole('button', { name: '부서 확인' }).click();
  await expect(page.getByRole('heading', { level: 1, name: '스터디 타이머' })).toBeVisible();
  await expect(main.getByText('매일 08:00')).toBeVisible(); // 더 보기가 펼쳐져 부서 일정이 보인다
});

test('운영 지표: 방문자 추이·기능별 사용·유입 출처·표, 카드에 7일 방문자', async ({ page }) => {
  await open(page);
  const card = page.getByRole('main').locator('.svc-card').filter({ hasText: '챙김표' });
  await expect(card).toContainText('최근 7일 방문자');
  await expect(card).toContainText(String([7, 8, 9, 10, 11, 12, 13].reduce((s, i) => s + 10 + i, 0)));
  await page.getByRole('navigation', { name: '서비스 목록' }).getByRole('button', { name: /챙김표/ }).click();
  const ops = page.locator('section[aria-labelledby="h-ops"]');
  await expect(ops.getByRole('heading', { name: '운영 지표' })).toBeVisible();
  await expect(ops).toContainText('오늘 방문자');
  await expect(ops.getByText('23', { exact: true }).first()).toBeVisible(); // 오늘 = 10 + 13
  await expect(ops.getByRole('img', { name: /날짜별 방문자/ })).toBeVisible();
  await expect(ops.locator('.hbars').first()).toContainText('참여(이름 추가)');
  await expect(ops.locator('.hbars').nth(1)).toContainText('Threads');
  await ops.getByText('표로 보기').click();
  await expect(ops.locator('table.data tbody tr')).toHaveCount(14);
  await noHScroll(page);
  // 숫자가 없는 서비스는 연결 방법을 알려 준다
  await page.getByRole('navigation', { name: '서비스 목록' }).getByRole('button', { name: /픽앤어스/ }).click();
  await expect(page.locator('section[aria-labelledby="h-ops"]')).toContainText('stats.url');
});

test('보기 전용 계정은 버튼 없이 상태만 본다', async ({ page }) => {
  await open(page, { canWrite: false });
  const main = page.getByRole('main');
  await expect(main.getByText('도메인 1년 등록')).toBeVisible();
  await expect(main.getByRole('button', { name: /승인:/ })).toHaveCount(0);
  await expect(main.getByRole('button', { name: /했어요:/ })).toHaveCount(0);
});

test('등록된 서비스가 없으면 어떻게 추가하는지 알려 준다', async ({ page }) => {
  await page.route('https://fonts.googleapis.com/**', (r) => r.abort());
  await page.route('**/cloud-hq', (r) => r.fulfill({ contentType: 'text/html', body: PAGE }));
  await page.addInitScript(fakeRuntime, { seed: {}, triggers: [], canWrite: true });
  await page.goto('/cloud-hq');
  await expect(page.getByText('아직 등록된 서비스가 없어요')).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`접근성 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await open(page);
    await expect(page.getByText('문제가 있는 서비스 1개')).toBeVisible();
    let r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    await page.getByRole('button', { name: /챙김표/ }).first().click();
    await expect(page.getByRole('heading', { level: 1, name: '챙김표' })).toBeVisible();
    await page.getByText(/더 보기/).click();
    await expect(page.getByText('월·목 12:00')).toBeVisible();
    r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    if (process.env.SHOTS) {
      await page.screenshot({ path: `test-results/cloud-hq-detail-${scheme}.png`, fullPage: true });
      await page.getByRole('button', { name: '← 전체 서비스' }).click();
      await page.screenshot({ path: `test-results/cloud-hq-overview-${scheme}.png`, fullPage: true });
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.screenshot({ path: `test-results/cloud-hq-overview-desktop-${scheme}.png`, fullPage: true });
    }
  });
}
