import { test, expect, devices } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

async function createTrip(page, name = '가평 캠핑') {
  await page.goto('/');
  await page.getByLabel('어디 가요?').fill(name);
  await page.getByRole('button', { name: '준비물 목록 만들기' }).click();
  await expect(page).toHaveURL(/\/t\/[\w-]+#k=/);
  await expect(page.getByText('관리 링크를 저장해 두세요')).toBeVisible();
}
async function joinAs(page, name) {
  await page.getByRole('textbox', { name: /내 이름/ }).fill(name);
  await page.getByRole('button', { name: '참여하기' }).click();
  await expect(page.getByText(`${name}(으)로 참여 중이에요`)).toBeVisible();
}
// 친구: 다른 브라우저(저장소 분리)로 초대 링크를 연다
async function friend(browser, url) {
  const ctx = await browser.newContext({ ...devices['iPhone 13'], permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}
const item = (page, name) => page.locator('li.item', { has: page.getByText(name, { exact: true }) });

test('총무 흐름: 만들기 → 참여 → 맡기 → 챙김 → 추가 → 장본 돈 → 카톡 현황', async ({ page }) => {
  await createTrip(page);
  await expect(page.getByText('0/16 맡음')).toBeVisible();
  await joinAs(page, '민수');
  await page.getByRole('button', { name: '텐트 내가 챙길게' }).click();
  await expect(item(page, '텐트')).toContainText('민수 맡음');
  await page.getByRole('button', { name: '텐트 챙겼어요' }).click();
  await expect(item(page, '텐트')).toContainText('민수 · 챙김 ✓');
  await expect(page.getByRole('button', { name: '텐트 챙겼어요' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByLabel('준비물 추가').fill('고기 2kg');
  await page.getByRole('button', { name: '추가', exact: true }).first().click();
  await expect(item(page, '고기 2kg')).toContainText('아직 없음');

  await page.getByLabel('금액 (원)').fill('60000');
  await page.getByLabel(/어디에 썼어요/).fill('마트');
  await page.getByRole('button', { name: '기록하기' }).click();
  await expect(page.getByText('민수 60,000원 · 마트')).toBeVisible();
  await expect(page.getByText('모두 정산됐어요')).toBeVisible(); // 혼자라 보낼 돈 없음

  await page.getByRole('button', { name: '카톡용 현황 복사' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  expect(clip).toContain('[가평 캠핑] 준비물 현황');
  expect(clip).toContain('민수: 텐트✓');
  expect(clip).toMatch(/여기서 맡아 주세요: http.+\/t\/[\w-]+$/);
});

test('친구 흐름: 초대 링크 → 이름 → 맡기, 먼저 맡은 건 뺏지 못함, 정산 안내', async ({ page, browser }) => {
  await createTrip(page);
  await joinAs(page, '민수');
  await page.getByRole('button', { name: '텐트 내가 챙길게' }).click();
  await expect(item(page, '텐트')).toContainText('민수 맡음');
  const invite = await page.locator('#invite-link').inputValue();
  expect(invite).not.toContain('#k=');

  const f = await friend(browser, invite);
  await expect(f.getByText('관리 링크를 저장해 두세요')).toBeHidden();
  await expect(item(f, '텐트')).toContainText('민수 맡음');
  await expect(f.getByRole('button', { name: '텐트 내가 챙길게' })).toHaveCount(0);
  // 이름을 안 고르고 누르면 안내
  await f.getByRole('button', { name: '버너 내가 챙길게' }).click();
  await expect(f.getByText('먼저 내 이름을 골라 주세요')).toBeVisible();
  await joinAs(f, '지영');
  await f.getByRole('button', { name: '버너 내가 챙길게' }).click();
  await expect(item(f, '버너')).toContainText('지영 맡음');

  // 민수 화면은 아직 옛 상태 — 버너를 누르면 누가 먼저 맡았는지 알려 주고 새로 고친다
  await page.getByRole('button', { name: '버너 내가 챙길게' }).click();
  await expect(page.getByText('지영님이 먼저 맡았어요')).toBeVisible();
  await expect(item(page, '버너')).toContainText('지영 맡음');

  // 지영이 장본 돈 30,000원을 둘이 나눔 → 민수가 지영에게 15,000원
  await f.getByLabel('금액 (원)').fill('30000');
  await f.getByRole('button', { name: '기록하기' }).click();
  await expect(f.getByText('민수 → 지영 15,000원')).toBeVisible();

  // 필터: 주인 없음 / 내가 맡은 것
  await f.getByText('내가 맡은 것').click();
  await expect(f.locator('li.item:visible')).toHaveCount(1);
  await f.getByText('주인 없음').click();
  await expect(item(f, '텐트')).toBeHidden();
  await expect(item(f, '타프')).toBeVisible();
  await f.context().close();
});

test('입력 오류: 빈 이름이면 오류 문구와 포커스', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '준비물 목록 만들기' }).click();
  await expect(page.getByText('이름을 입력해 주세요')).toBeVisible();
  await expect(page.getByLabel('어디 가요?')).toBeFocused();
});

test('네트워크 실패: 맡기 실패 안내, 상태 그대로', async ({ page }) => {
  await createTrip(page);
  await joinAs(page, '민수');
  await page.route('**/items/*', (r) => r.abort());
  await page.getByRole('button', { name: '텐트 내가 챙길게' }).click();
  await expect(page.getByText('저장하지 못했어요. 연결을 확인하고 다시 시도해 주세요')).toBeVisible();
  await expect(item(page, '텐트')).toContainText('아직 없음');
});

test('관리 링크: 틀린 키는 참여 화면 + 안내, 맞는 키로 목록 삭제', async ({ page }) => {
  await createTrip(page);
  const url = page.url();
  await page.goto('about:blank');
  await page.goto(url.replace(/#k=.*/, '#k=wrong'));
  await expect(page.getByText('관리 링크가 올바르지 않아요')).toBeVisible();
  await expect(page.getByRole('button', { name: '목록 삭제' })).toBeHidden();
  await page.goto('about:blank');
  await page.goto(url);
  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: '목록 삭제' }).click();
  await expect(page).toHaveURL(/\/$/);
  const res = await page.goto(url.replace(/#k=.*/, ''));
  expect(res.status()).toBe(404);
  await expect(page.getByRole('heading', { name: '목록을 찾을 수 없어요' })).toBeVisible();
});

for (const scheme of ['light', 'dark']) {
  test(`접근성 자동 점검 (${scheme})`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const check = async () => {
      const r = await new AxeBuilder({ page }).analyze();
      expect(r.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target).join(' ')}`)).toEqual([]);
    };
    await page.goto('/');
    await check();
    await createTrip(page);
    await joinAs(page, '민수');
    await page.getByRole('button', { name: '텐트 내가 챙길게' }).click();
    await expect(item(page, '텐트')).toContainText('민수 맡음');
    await page.getByLabel('금액 (원)').fill('10000');
    await page.getByRole('button', { name: '기록하기' }).click();
    await expect(page.getByText('민수 10,000원')).toBeVisible();
    await check();
    await page.getByRole('link', { name: '의견 보내기' }).click();
    await check();
  });
}

test('화면 글자에 null·undefined·NaN 이 새지 않는다', async ({ page }) => {
  await createTrip(page);
  await joinAs(page, '민수');
  const text = await page.locator('body').innerText();
  expect(text).not.toMatch(/(?<![A-Za-z])(?:null|undefined|NaN)+(?![A-Za-z])|\[object Object\]/);
});
