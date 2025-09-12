import { test, expect } from "@playwright/test";

// Minimal E2E: after auth bypass, visit (dashboard)/backtests and assert editor & template buttons are visible
// Uses cookie-based bypass supported by `(dashboard)/layout.tsx` (cookie: e2e_auth_bypass=1)

test.describe("Backtests page - strategy editor smoke", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);
  });

  test("shows editor and template actions", async ({ page }) => {
    await page.goto("/backtests");

    // Editor container should be visible
    await expect(page.getByTestId("editor")).toBeVisible();

    // Template reset button should be visible
    await expect(page.getByTestId("reset-template")).toBeVisible();
  });

  test("submit backtest triggers API and redirects to status page (E2E placeholder)", async ({ page }) => {
    await page.route("**/api/v1/backtests", async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ id: "e2e-job-123", status: "queued" }),
      });
    });

    await page.goto("/backtests");

    // 点击“提交回测”按钮
    await page.getByRole("button", { name: /提交回测/ }).click();

    // 断言出现状态提示（role=status）
    await expect(page.getByRole("status")).toBeVisible();

    // 跳转到 /backtests/{id}
    await expect(page).toHaveURL(/\/backtests\/e2e-job-123/);
  });
});
