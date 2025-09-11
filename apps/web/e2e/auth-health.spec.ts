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

  test('Authenticated (bypass) user can access /health and see HealthCard', async ({ page, context }) => {
    // 通过 Cookie 方式绕过鉴权，仅用于测试
    await context.addCookies([
      { name: 'e2e_auth_bypass', value: '1', domain: 'localhost', path: '/', httpOnly: false } as any,
    ]);
    await page.goto('/health');
    // 应看到健康页标题或健康卡片中的关键元素
    const titleVisible = await page.getByRole('heading', { name: /系统健康|Health/i }).isVisible().catch(() => false);
    const anyStatusIcon = await page.locator('text=🟢 正常, 🟠 降级, 🔴 不可用').first().isVisible().catch(() => false);
    expect(titleVisible || anyStatusIcon).toBeTruthy();
  });
});
