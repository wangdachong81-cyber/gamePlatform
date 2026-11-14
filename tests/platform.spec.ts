import { test, expect } from '@playwright/test';

test('切换主题、运行两个引擎，并在退出后重新进入', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '星星收集员' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /2D 乐游场/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: /星星收集员/ }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.play-toolbar [role="status"]')?.textContent), { timeout: 40000 }).toBe('游戏运行中');
  await expect(page.locator('.game-host canvas')).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('.play-toolbar [role="status"]')).toHaveText('游戏已暂停');
  await page.getByRole('button', { name: '继续', exact: true }).click();
  await page.getByRole('button', { name: '重开', exact: true }).click();
  await expect(page.locator('.score-pill')).toHaveText('得分 0');
  await page.getByRole('link', { name: '返回游戏大厅' }).click();
  await expect(page.locator('wujie-app')).toHaveCount(0);
  await page.getByRole('tab', { name: /3D 新宇宙/ }).click();
  await expect(page.locator('.platform')).toHaveAttribute('data-world', '3d');
  await expect(page.getByRole('heading', { name: '浮空晶境' })).toBeVisible();
  await page.getByRole('button', { name: /浮空晶境/ }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.play-toolbar [role="status"]')?.textContent), { timeout: 40000 }).toBe('游戏运行中');
  await expect(page.locator('.game-host canvas')).toBeVisible();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('.play-toolbar [role="status"]')).toHaveText('游戏已暂停');
  await page.getByRole('link', { name: '返回游戏大厅' }).click();
  await page.getByRole('button', { name: /浮空晶境/ }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.play-toolbar [role="status"]')?.textContent), { timeout: 40000 }).toBe('游戏运行中');
  await expect(page.locator('.game-host canvas')).toHaveCount(1);
});

test('配置支持新标签页直接运行子平台', async ({ page, context }) => {
  await page.route('**/config/games.json', async route => {
    const response = await route.fetch();
    const data = await response.json();
    data.games.find((game: { id: string }) => game.id === 'star-catcher').openMode = 'new-tab';
    await route.fulfill({ json: data });
  });
  await page.goto('/');
  const newPage = context.waitForEvent('page');
  await page.getByRole('button', { name: /星星收集员/ }).click();
  const child = await newPage;
  await expect(child).toHaveURL(/games-2d\/#\/games\/star-catcher/);
  await expect(child.locator('canvas')).toBeVisible({ timeout: 30000 });
  await expect(page).toHaveURL(/\/#\/$/);
});

test('移动端搜索、空状态与键盘切换', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: '星星收集员' })).toBeVisible();
  await page.getByRole('textbox', { name: '搜索游戏' }).fill('没有这个游戏');
  await expect(page.getByText('没有找到匹配的游戏，换个关键词试试。')).toBeVisible();
  await page.getByRole('textbox', { name: '搜索游戏' }).fill('');
  await page.getByRole('tab', { name: /2D 乐游场/ }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: /3D 新宇宙/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: '浮空晶境' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
});
