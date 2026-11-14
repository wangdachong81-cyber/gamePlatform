import { test, expect } from '@playwright/test';
test.use({ viewport: { width: 960, height: 640 } });

test('几猫从 3D 大厅在新标签页启动，并保留开始与暂停操作', async ({ page, context }) => {
  test.setTimeout(120000);
  await context.addInitScript(() => {
    if (location.pathname.endsWith('/games-3d/') && location.hash === '#/games/jimao') {
      const url = new URL(location.href);
      url.searchParams.set('q', 'test');
      url.searchParams.set('noaudio', '1');
      url.searchParams.set('post', '0');
      // Advance the original game's fixed-step hook under software WebGL.
      url.searchParams.set('dt', '1');
      history.replaceState(history.state, '', url);
    }
  });
  await page.goto('/?world=3d');
  const card = page.getByRole('button', { name: /几猫国产3A大作/ });
  await expect(card).toBeEnabled();
  const opened = context.waitForEvent('page');
  await card.click();
  const game = await opened;
  const errors: string[] = [];
  game.on('pageerror', error => errors.push(error.message));
  await game.bringToFront();
  await expect(game).toHaveURL(/\/games-3d\/.*#\/games\/jimao/);
  await expect(game).toHaveTitle('几猫国产3A大作 · 游隙');
  await expect(game.locator('[data-game="jimao"]')).toHaveAttribute('data-ready', 'true', { timeout: 90000 });
  await expect(game.locator('#view')).toBeVisible();
  await expect(game.locator('#boot')).toBeHidden();
  await expect(game.getByRole('button', { name: '开始行动', exact: true })).toBeVisible();
  await game.screenshot({ path: 'artifacts/jimao-title.png' });
  await game.getByRole('button', { name: '开始行动', exact: true }).click();
  await expect(game.locator('.menu')).toHaveAttribute('data-screen', 'none', { timeout: 15000 });
  await expect(game.locator('.hud')).toHaveClass(/\bon\b/, { timeout: 30000 });
  await game.screenshot({ path: 'artifacts/jimao-playing.png' });
  await game.keyboard.press('Escape');
  await expect(game.locator('.menu')).toHaveAttribute('data-screen', 'paused', { timeout: 10000 });
  await expect(page.getByRole('heading', { name: '几猫国产3A大作' })).toBeVisible();
  await expect(page.locator('.game-host')).toHaveCount(0);
  expect(errors).toEqual([]);
  await game.close();
});
