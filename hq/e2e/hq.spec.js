import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.configure({ mode: 'serial' });
const PW = 'correct-horse-battery';

test('처음 설정 → 연결 → 회사 세우기 → 결재까지', async ({ page }) => {
  page.on('dialog', (d) => d.accept());
  await page.goto('/');
  await expect(page).toHaveURL(/\/setup/);
  await page.getByLabel('회사 이름').fill('벌금장부 컴퍼니');
  await page.getByLabel('대표 비밀번호 (10자 이상)').fill(PW);
  await page.getByLabel('비밀번호 한 번 더').fill(PW);
  await page.getByRole('button', { name: '회사 만들기' }).click();
  await expect(page.getByText('회사가 만들어졌어요')).toBeVisible();

  // GitHub 연결: 틀린 키 → 안내, 맞는 키 → 연결됨
  await page.goto('/connect/github');
  await expect(page.getByText('Fine-grained tokens')).toBeVisible();
  await page.getByLabel('저장소 (소유자/이름)').fill('Mode1221/beolgeum');
  await page.getByLabel('접근 토큰').fill('wrong');
  await page.getByRole('button', { name: '연결 확인하고 저장' }).click();
  await expect(page.getByText('키가 올바르지 않거나 권한이 부족해요')).toBeVisible();
  await page.getByLabel('저장소 (소유자/이름)').fill('Mode1221/beolgeum');
  await page.getByLabel('접근 토큰').fill('good-token');
  await page.getByRole('button', { name: '연결 확인하고 저장' }).click();
  await expect(page.getByText('GitHub 연결됨')).toBeVisible();

  await page.goto('/connect/anthropic');
  await page.getByLabel('API 키 (부서 실행용)').fill('sk-ant-api-good');
  await page.getByLabel('관리자 키 (비용 조회용, 선택)').fill('sk-ant-admin-good');
  await page.getByRole('button', { name: '연결 확인하고 저장' }).click();
  await expect(page.getByText('API 키와 관리자 키 모두 확인했어요')).toBeVisible();

  for (const [id, fields] of [
    ['health', { '확인할 주소 (한 줄에 하나)': 'https://status.example.com/health' }],
    ['metrics', { '지표 주소 (JSON)': 'https://metrics.example.com/api/stats' }],
    ['sentry', { '조직 이름(slug)': 'o', '프로젝트 이름(slug)': 'p', '인증 토큰': 'good-token' }],
    ['stripe', { '제한된 키 (읽기 전용 권장)': 'good-token' }],
  ]) {
    await page.goto(`/connect/${id}`);
    for (const [label, v] of Object.entries(fields)) await page.getByLabel(label).fill(v);
    await page.getByRole('button', { name: '연결 확인하고 저장' }).click();
    await expect(page.locator('.flash-ok')).toBeVisible();
  }

  await page.goto('/connect');
  await page.getByRole('button', { name: '회사 세우기' }).click();
  await expect(page.getByText('회사를 세웠어요')).toBeVisible();

  // 홈: 상태·결재·대표 할 일·지표
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '지금 문제가 있어요' })).toBeVisible(); // ops-alert 가 있으므로
  await expect(page.getByText('정기 점검 실패 1건')).toBeVisible();
  await expect(page.getByText('Fly.io 계정 만들기 — B12')).toBeVisible();
  await expect(page.locator('.tile', { hasText: '이번 달 AI 사용료' })).toContainText('$13.50'); // Claude 조직 비용
  await expect(page.getByText('주간 활성 모임')).toBeVisible();

  // 결재: 승인 1건, 반려 1건 (결재가 있는 상태의 접근성도 확인)
  await page.goto('/approvals');
  expect((await new AxeBuilder({ page }).analyze()).violations.map((v) => v.id)).toEqual([]);
  const deploy = page.locator('article', { hasText: '카카오 로그인 기능을 사용자에게 내보내기' });
  await expect(deploy.getByText('오늘 밤 새 버전이 나가요')).toBeVisible();
  await deploy.getByRole('button', { name: '승인' }).click();
  await expect(page.getByText('#1 승인했어요')).toBeVisible();
  const post = page.locator('article', { hasText: '스레드 홍보 글' });
  await post.getByText('반려', { exact: true }).click();
  await post.getByLabel('반려 이유').fill('문구가 너무 광고 같아요');
  await post.getByRole('button', { name: '반려하기' }).click();
  await expect(page.getByText('#2 반려했어요')).toBeVisible();
  await expect(page.getByText('결재할 일이 없어요')).toBeVisible();

  // 대표 할 일 완료
  await page.goto('/');
  await page.locator('li', { hasText: '문의 이메일 만들기' }).getByRole('button', { name: '완료' }).click();
  await expect(page.getByText('완료로 표시했어요')).toBeVisible();
  await expect(page.getByText('문의 이메일 만들기')).toBeHidden();

  // 새 일 맡기기 → 보드
  await page.goto('/board');
  await page.getByText('새 일 맡기기').click();
  await page.getByLabel('무엇을 해야 하나요?').fill('가입 화면에 카카오 로그인 추가');
  await page.getByRole('button', { name: '맡기기' }).click();
  await expect(page.getByText('기획 부서에 일을 맡겼어요')).toBeVisible();
  await expect(page.locator('.col', { hasText: '할 일' }).getByText('가입 화면에 카카오 로그인 추가')).toBeVisible();

  // 부서 지금 일하기
  await page.goto('/depts');
  await page.locator('article', { hasText: 'QA' }).getByRole('button', { name: '지금 일하기' }).click();
  await expect(page.getByText('QA 부서를 지금 실행했어요')).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`접근성 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/login');
    await page.getByLabel('대표 비밀번호').fill(PW);
    await page.getByRole('button', { name: '들어가기' }).click();
    for (const path of ['/', '/approvals', '/board', '/depts', '/connect', '/connect/github', '/settings', '/help']) {
      await page.goto(path);
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${path} ${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    }
  });
}
