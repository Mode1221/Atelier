import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function createGroup(page, name = '알고리즘 스터디') {
  await page.goto('/');
  await page.getByLabel('모임 이름').fill(name);
  await page.getByRole('button', { name: '모임 만들기' }).click();
  await expect(page).toHaveURL(/\/g\/[\w-]+#k=/);
  await expect(page.getByText('관리 링크를 꼭 저장하세요')).toBeVisible();
}

test('운영자 핵심 흐름: 만들기 → 멤버 → 회차 → 납부 → 보기 링크', async ({ page, context }) => {
  await createGroup(page);
  for (const n of ['민수', '지영']) {
    await page.getByLabel('이름 (별명 권장)').fill(n);
    await page.getByRole('button', { name: '추가' }).click();
    await expect(page.getByRole('radiogroup', { name: `${n} 출결` })).toBeVisible();
  }
  await page.getByRole('radiogroup', { name: '민수 출결' }).getByText('지각').click();
  await page.getByRole('radiogroup', { name: '지영 출결' }).getByText('결석').click();
  await page.locator('#session-entries .att').nth(1).getByText('과제 미제출').click();
  await expect(page.locator('#session-total')).toHaveText('이번 회차 합계 6,000원');
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.locator('li.card').first()).toContainText('합계 6,000원');

  await page.getByLabel('멤버', { exact: true }).selectOption({ label: '지영' });
  await page.getByLabel('금액').fill('3000');
  await page.getByRole('button', { name: '기록' }).click();
  await expect(page.locator('tr', { hasText: '지영' }).locator('td').last()).toHaveText('2,000');

  await page.getByRole('button', { name: '카톡용 요약 복사' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('지영 2,000원 미납');
  expect(clip).toContain('미납 합계 3,000원');

  // 보기 링크: 편집 UI 없음
  const viewUrl = await page.locator('#view-link').inputValue();
  const viewer = await context.newPage();
  await viewer.goto(viewUrl);
  await expect(viewer.locator('tr', { hasText: '민수' })).toContainText('1,000');
  await expect(viewer.getByRole('button', { name: '저장' })).toBeHidden();
  await expect(viewer.getByText('관리 링크를 꼭 저장하세요')).toBeHidden();
});

test('입력 오류: 빈 이름이면 오류 문구와 포커스', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '모임 만들기' }).click();
  await expect(page.getByText('모임 이름을 입력해 주세요')).toBeVisible();
  await expect(page.getByLabel('모임 이름')).toBeFocused();
});

test('네트워크 실패: 저장 실패 안내 후 체크 상태 유지', async ({ page }) => {
  await createGroup(page);
  await page.getByLabel('이름 (별명 권장)').fill('민수');
  await page.getByRole('button', { name: '추가' }).click();
  await page.getByRole('radiogroup', { name: '민수 출결' }).getByText('결석').click();
  await page.route('**/sessions', (r) => r.abort());
  await page.getByRole('button', { name: '저장' }).click();
  await expect(page.getByText('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요')).toBeVisible();
  await expect(page.getByRole('radiogroup', { name: '민수 출결' }).getByRole('radio', { name: '결석' })).toBeChecked();
});

test('틀린 관리 키는 보기 전용 + 안내', async ({ page }) => {
  await createGroup(page);
  const url = page.url().replace(/#k=.*/, '#k=wrong');
  await page.goto('about:blank');
  await page.goto(url);
  await expect(page.getByText('관리 링크가 올바르지 않아요')).toBeVisible();
  await expect(page.getByRole('button', { name: '저장' })).toBeHidden();
});

test('없는 모임은 404 화면', async ({ page }) => {
  const res = await page.goto('/g/does-not-exist');
  expect(res.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '모임을 찾을 수 없어요' })).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`접근성 자동 점검 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/');
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await createGroup(page);
    await page.getByLabel('이름 (별명 권장)').fill('민수');
    await page.getByRole('button', { name: '추가' }).click();
    await expect(page.getByRole('radiogroup', { name: '민수 출결' })).toBeVisible();
    const r = await new AxeBuilder({ page }).analyze();
    expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    await page.getByRole('link', { name: '의견 보내기' }).click();
    const f = await new AxeBuilder({ page }).analyze();
    expect(f.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
  });
}

test('베타 의견 보내기: 푸터 링크 → 종류·내용 → 감사 화면', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: '의견 보내기' }).click();
  await expect(page).toHaveURL(/\/feedback\?from=%2F$/);
  await page.getByLabel('불편해요').check();
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.getByText('내용을 적어 주세요')).toBeVisible();
  await page.getByLabel('내용').fill('벌금 규칙을 나중에 바꾸고 싶어요');
  await page.getByRole('button', { name: '보내기' }).click();
  await expect(page.getByRole('heading', { name: '고마워요!' })).toBeFocused();
});

test('보기 링크로 온 멤버에게 "우리 모임 장부 만들기" 안내, 운영자에겐 숨김', async ({ page, context }) => {
  await createGroup(page);
  await expect(page.getByRole('link', { name: '우리 모임 장부 만들기' })).toBeHidden();
  const viewer = await context.newPage();
  await viewer.goto(await page.locator('#view-link').inputValue());
  await viewer.getByRole('link', { name: '우리 모임 장부 만들기' }).click();
  await expect(viewer).toHaveURL(/\/\?ref=view$/);
});
