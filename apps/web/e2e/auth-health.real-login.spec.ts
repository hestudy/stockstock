import { test, expect } from '@playwright/test';

/**
 * Real login E2E for Story 1.1 (AC1):
 * - Uses Supabase credentials from env: E2E_SUPABASE_EMAIL / E2E_SUPABASE_PASSWORD
 * - Requires NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY configured for the web app
 * - Skips automatically if credentials are not provided, so repo can merge safely and CI can enable later
 */
const E2E_EMAIL = process.env.E2E_SUPABASE_EMAIL;
const E2E_PASSWORD = process.env.E2E_SUPABASE_PASSWORD;

const describeOrSkip = E2E_EMAIL && E2E_PASSWORD ? test.describe : test.describe.skip;

describeOrSkip('Auth & Health (Real Supabase Login)', () => {
  test('login with Supabase then access /health and see HealthCard', async ({ page }) => {
    await page.goto('/login');

    // Fill in email/password and submit
    await page.getByPlaceholder('email').fill(E2E_EMAIL!);
    await page.getByPlaceholder('password').fill(E2E_PASSWORD!);
    await page.getByRole('button', { name: /登录|Login/ }).click();

    // Expect navigation to protected page and visibility of health content
    await page.waitForURL(/\/health/);

    const titleVisible = await page.getByRole('heading', { name: /系统健康|Health/i }).isVisible().catch(() => false);
    const anyStatusIcon = await page.locator('text=🟢 正常, 🟠 降级, 🔴 不可用').first().isVisible().catch(() => false);
    expect(titleVisible || anyStatusIcon).toBeTruthy();
  });
});

// UI-friendly message coverage for AC4 (no backend changes needed)
test.describe('Friendly UI messages on Login page (forbidden/degraded)', () => {
  test('forbidden banner shows friendly copy', async ({ page }) => {
    await page.goto('/login?reason=forbidden');
    await expect(page.getByText(/没有访问|没有权限|forbidden/i)).toBeVisible();
  });

  test('degraded banner shows friendly copy', async ({ page }) => {
    await page.goto('/login?reason=degraded');
    await expect(page.getByText(/暂时不可用|degraded/i)).toBeVisible();
  });
});
