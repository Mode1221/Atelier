import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ mode: 'serial' });
const REPO = 'Mode1221/beolgeum';
const fakeState = async (page) => (await page.request.get('/__fake-state')).json();

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('hq.apiBase', `${location.origin}/__fake/api.github.com`);
    localStorage.setItem('hq.anthropicBase', `${location.origin}/__fake/api.anthropic.com`);
  });
  page.on('dialog', (d) => d.accept());
});

async function login(page, token = 'good-token', remember = true) {
  await page.goto('/');
  await page.getByLabel('회사 저장소 (소유자/이름)').fill(REPO);
  await page.getByLabel('GitHub 접근 토큰').fill(token);
  if (remember) await page.getByLabel(/이 기기에서 기억하기/).check();
  await page.getByRole('button', { name: '들어가기' }).click();
}

test('로그인 → 연결 → 회사 세우기 → 결재 → 할 일 → 업무 → 부서 → 설정 → 로그아웃', async ({ page }) => {
  await login(page, 'wrong');
  await expect(page.getByText('토큰이 올바르지 않거나 만료됐어요')).toBeVisible();
  await login(page);
  await expect(page.getByRole('heading', { name: '시작하기' })).toBeVisible();

  // Claude: 틀린 키는 브라우저에서 바로 거절, 맞는 키는 GitHub 비밀값으로 봉인 저장
  await page.goto('/#/connect/anthropic');
  await page.getByLabel('API 키 (부서 실행용)').fill('bad');
  await page.getByRole('button', { name: '확인하고 저장' }).click();
  await expect(page.getByText('Claude API 키가 올바르지 않아요')).toBeVisible();
  await page.getByLabel('API 키 (부서 실행용)').fill('sk-ant-api-good');
  await page.getByLabel('관리자 키 (비용 조회용)').fill('sk-ant-admin-good');
  await page.getByRole('button', { name: '확인하고 저장' }).click();
  await expect(page.getByText('Claude (AI 직원) 연결됨')).toBeVisible();

  await page.goto('/#/connect/health');
  await page.getByLabel('확인할 주소 (한 줄에 하나)').fill('https://beolgeum.example/health');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('서비스 상태 확인 연결됨')).toBeVisible();

  await page.getByRole('button', { name: '회사 세우기' }).click();
  await expect(page.getByText(/회사를 세웠어요: 라벨 17개 준비/)).toBeVisible();

  let st = await fakeState(page);
  expect(st.secrets.ANTHROPIC_API_KEY).toBe('sk-ant-api-good'); // 브라우저 봉인 → 가짜 GitHub 가 libsodium 으로 열어 확인
  expect(JSON.parse(st.secrets.ATELIER_SVC_ANTHROPIC)).toEqual({ admin_key: 'sk-ant-admin-good' });
  expect(JSON.parse(st.secrets.ATELIER_SVC_HEALTH).urls).toBe('https://beolgeum.example/health');
  expect(st.files['.github/workflows/atelier-company.yml'].text).toContain('atelier-data');
  expect(st.files['.github/atelier/collect.mjs'].text).toContain('export async function collect');
  expect(Object.keys(st.branches['atelier-data'])).toContain('hq.json');

  // 수집기·부서 실행이 남긴 것처럼 데이터 브랜치에 기록을 넣는다
  const put = (path, obj) =>
    page.request.put(`/__fake/api.github.com/repos/${REPO}/contents/${path}`, { headers: { authorization: 'Bearer good-token' }, data: { message: 'x', branch: 'atelier-data', content: Buffer.from(JSON.stringify(obj)).toString('base64') } });
  const month = new Date().toISOString().slice(0, 7);
  await put('status.json', { at: new Date().toISOString(), services: { anthropic: { summary: { level: 'good', headline: '이번 달 AI 사용료 $13.50', value: 13.5 } }, sentry: { summary: { level: 'warning', headline: '최근 24시간 오류 2종류', value: 2 } } } });
  await put(`runs/${month}/qa__555__9.5000__success.json`, {});
  await page.goto('/#/');
  await page.getByRole('button', { name: '로그아웃' }).waitFor();
  await page.evaluate(() => location.reload());
  await expect(page.getByRole('heading', { name: '지금 문제가 있어요' })).toBeVisible();
  await expect(page.locator('.tile', { hasText: '이번 달 AI 사용료' })).toContainText('$13.50');
  await expect(page.locator('.tile', { hasText: '최근 24시간 오류' })).toContainText('2종류');
  await expect(page.getByText('사용성 테스트 5명 — L1')).toBeVisible();

  // 결재
  await page.goto('/#/approvals');
  await page.locator('article', { hasText: '카카오 로그인 기능을 사용자에게 내보내기' }).getByRole('button', { name: '승인' }).click();
  await expect(page.getByText('#1 승인했어요')).toBeVisible();
  const post = page.locator('article', { hasText: '스레드 홍보 글' });
  await post.getByText('반려', { exact: true }).click();
  await post.getByLabel('반려 이유').fill('문구가 너무 광고 같아요');
  await post.getByRole('button', { name: '반려하기' }).click();
  await expect(page.getByText('#2 반려했어요')).toBeVisible();
  st = await fakeState(page);
  expect(st.issues.find((i) => i.number === 1).labels.map((l) => l.name)).toEqual(['dept:dev', 'approved']);
  expect(st.comments[2].at(-1).body).toContain('문구가 너무 광고 같아요');

  // 대표 할 일 완료 → PROJECT.md 커밋
  await page.goto('/#/');
  await page.locator('li', { hasText: '비공개 베타' }).getByRole('button', { name: '완료' }).click();
  await expect(page.getByText('완료로 표시했어요')).toBeVisible();
  expect((await fakeState(page)).files['PROJECT.md'].text).toContain('- [x] 비공개 베타');

  // 새 일 맡기기
  await page.goto('/#/board');
  await page.getByText('새 일 맡기기').click();
  await page.getByLabel('무엇을 해야 하나요?').fill('후원 버튼 추가');
  await page.getByRole('button', { name: '맡기기' }).click();
  await expect(page.getByText('기획 부서에 일을 맡겼어요')).toBeVisible();
  await expect(page.locator('.col', { hasText: '할 일' }).getByText('후원 버튼 추가')).toBeVisible();

  // 부서: QA 는 이번 달 $9.50 사용 (예산 $10), 지금 일하기, 마케팅 쉬게 하기
  await page.goto('/#/depts');
  const qa = page.locator('article', { hasText: '품질 검사' });
  await expect(qa).toContainText('이번 달 $9.50 / 예산 $10.00');
  await qa.getByRole('button', { name: '지금 일하기' }).click();
  await expect(page.getByText('QA 부서를 지금 실행했어요')).toBeVisible();
  await page.locator('article', { hasText: '홍보 글·광고' }).getByRole('button', { name: '쉬게 하기' }).click();
  await expect(page.getByText('마케팅 부서를 쉬게 했어요')).toBeVisible();
  st = await fakeState(page);
  expect(st.dispatches.at(-1)).toEqual({ ref: 'main', inputs: { dept: 'qa' } });
  expect(JSON.parse(st.branches['atelier-data']['hq.json'].text).paused).toEqual(['marketing']);

  // 설정: 예산 변경
  await page.goto('/#/settings');
  await page.getByLabel('QA').fill('20');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('저장했어요')).toBeVisible();
  expect(JSON.parse((await fakeState(page)).branches['atelier-data']['hq.json'].text).budgets.qa).toBe(20);

  // 홍보: 공식 공유 창 링크(utm 포함) · 올림 기록 · 베타 의견
  await page.goto('/#/share');
  const threads = page.locator('article', { hasText: 'Threads' });
  const href = await threads.getByRole('link', { name: 'Threads에 올리기' }).getAttribute('href');
  expect(href).toContain('https://www.threads.net/intent/post?text=');
  expect(decodeURIComponent(href)).toContain('utm_source=threads');
  await expect(page.locator('article', { hasText: '카카오톡' }).getByRole('link')).toHaveCount(0);
  await threads.getByRole('button', { name: '올렸어요' }).click();
  await expect(page.getByText('올린 것으로 기록했어요')).toBeVisible();
  await expect(page.locator('article', { hasText: 'Threads' })).toContainText('올림');
  expect(Object.keys((await fakeState(page)).branches['atelier-data']).some((k) => /^shares\/\d{4}-\d{2}-\d{2}__threads__0\.json$/.test(k))).toBe(true);
  await expect(page.getByRole('link', { name: '베타 피드백 2026-09-29 (3건)' })).toBeVisible();

  // 로그아웃하면 토큰이 브라우저에서 지워진다
  await page.goto('/#/settings');
  await page.getByRole('button', { name: '로그아웃 (토큰 지우기)' }).click();
  await expect(page.getByLabel('GitHub 접근 토큰')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('hq.auth') ?? sessionStorage.getItem('hq.auth'))).toBeNull();
});

for (const scheme of ['light', 'dark']) {
  test(`접근성 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
    await login(page);
    for (const path of ['#/', '#/approvals', '#/board', '#/depts', '#/share', '#/connect', '#/connect/sentry', '#/settings', '#/help']) {
      await page.goto(`/${path}`);
      await page.locator('main h1').first().waitFor();
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    }
  });
}
