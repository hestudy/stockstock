import { test, expect } from '@playwright/test';

// Minimal E2E covering auth redirect and health page visibility contract
// BaseURL is configured in playwright.config.ts. Dev server auto-starts there.

test.describe('Auth & Health Canary (Story 1.1)', () => {
  test('Login page is reachable', async ({ page }) => {
    await page.goto('/login');
    await expect(page).toHaveURL(/\/login/);
    // 弹性断言：页面包含“登录”或“Login”字样之一
    const hasCN = await page.getByText(/登录/).first().isVisible().catch(() => false);
    const hasEN = await page.getByText(/Login/i).first().isVisible().catch(() => false);
    expect(hasCN || hasEN).toBeTruthy();
  });

  test('Protected dashboard route redirects unauthenticated users to /login', async ({ page }) => {
    await page.goto('/health');
    await expect(page).toHaveURL(/\/login/);
    // 友好文案（非技术术语）存在即可；放宽为“请先登录/Please sign in”之一
    const friendlyCN = await page.getByText(/请先登录|没有访问|未登录/).first().isVisible().catch(() => false);
    const friendlyEN = await page.getByText(/sign in|not authorized|please login/i).first().isVisible().catch(() => false);
    expect(friendlyCN || friendlyEN).toBeTruthy();
  });
});
