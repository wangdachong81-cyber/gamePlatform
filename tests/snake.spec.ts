import { test, expect } from '@playwright/test';

test('贪吃蛇内嵌启动、吃果子加分、平台暂停重开以及退出重进', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => { if (!error.message.includes('iframe主动中断')) errors.push(error.message); });
  await page.goto('/');
  await page.getByRole('button', { name: /贪吃蛇/ }).click();
  await expect.poll(() => page.evaluate(() => document.querySelector('.play-toolbar [role="status"]')?.textContent), { timeout: 30000 }).toBe('游戏运行中');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await expect(page.getByTestId('snake-score')).toHaveText('010');
  await page.locator('.play-toolbar').getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('.snake-game')).toHaveAttribute('data-phase', 'paused');
  await expect(page.locator('.score-pill')).toHaveText('得分 10');
  await page.screenshot({ path: 'artifacts/snake-desktop.png', fullPage: true });
  await page.locator('.play-toolbar').getByRole('button', { name: '重开', exact: true }).click();
  await expect(page.getByTestId('snake-score')).toHaveText('000');
  await page.getByRole('link', { name: '返回游戏大厅' }).click();
  await page.getByRole('button', { name: /贪吃蛇/ }).click();
  await expect(page.getByRole('button', { name: '开始游戏', exact: true })).toBeVisible();
  await expect(page.locator('.snake-record strong')).toHaveText('10');
  expect(errors).toEqual([]);
});

test('手机方向按钮、滑动和暂停', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/games-2d/#/games/snake');
  await page.getByRole('button', { name: '开始游戏', exact: true }).click();
  await page.getByRole('button', { name: '向上', exact: true }).click();
  const board = page.locator('.snake-board'); const bounds = (await board.boundingBox())!;
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down(); await page.mouse.move(bounds.x + bounds.width / 2 - 60, bounds.y + bounds.height / 2); await page.mouse.up();
  await page.getByRole('button', { name: '暂停', exact: true }).click();
  await expect(page.locator('.snake-game')).toHaveAttribute('data-phase', 'paused');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: 'artifacts/snake-mobile.png', fullPage: true });
});
