import { test, expect } from "@playwright/test";

test.describe("Optimization submit UI", () => {
  test.beforeEach(async ({ context }) => {
    await context.addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);
  });

  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/v1\/optimizations\/history.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([]),
      });
    });
  });

  test("submits optimization successfully", async ({ page }) => {
    await page.route("**/api/v1/optimizations", async (route) => {
      const body = route.request().postDataJSON() as Record<string, any>;
      expect(body.versionId).toBe("ver-e2e-1");
      expect(body.paramSpace).toHaveProperty("ma_short");
      expect(body.concurrencyLimit).toBe(4);
      expect(body.earlyStopPolicy).toEqual({ metric: "sharpe", threshold: 1.2, mode: "max" });
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ id: "opt-e2e-1", status: "queued" }),
      });
    });

    await page.goto("/optimizations");
    await page.fill('[data-testid="optimizations-version"]', "ver-e2e-1");
    await page.fill('[data-testid="optimizations-concurrency"]', "4");
    await page.fill('[data-testid="optimizations-early-metric"]', "sharpe");
    await page.fill('[data-testid="optimizations-early-threshold"]', "1.2");
    await page.selectOption('[data-testid="optimizations-early-mode"]', "max");

    await page.click('[data-testid="optimizations-submit"]');

    const successNotice = page.locator('[data-testid="optimizations-success"]');
    await expect(successNotice).toContainText("提交成功");
    await expect(page).toHaveURL(/\/optimizations\/opt-e2e-1$/);
  });

  test("显示参数错误并展示原始信息", async ({ page }) => {
    await page.route("**/api/v1/optimizations", async (route) => {
      await route.fulfill({
        status: 400,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "E.PARAM_INVALID",
            message: "param space too large",
            details: { limit: 32, estimate: 64 },
          },
        }),
      });
    });

    await page.goto("/optimizations");
    await page.fill('[data-testid="optimizations-version"]', "ver-e2e-err");
    await page.click('[data-testid="optimizations-submit"]');

    const errorBox = page.locator('[data-testid="optimizations-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("参数不合法，请检查后重试。");
    await expect(errorBox).toContainText("param space too large");
  });

  test("401 鉴权失败时提示重新登录", async ({ page }) => {
    await page.route("**/api/v1/optimizations", async (route) => {
      await route.fulfill({
        status: 401,
        contentType: "application/json",
        body: JSON.stringify({
          error: {
            code: "E.AUTH",
            message: "authentication required",
          },
        }),
      });
    });

    await page.goto("/optimizations");
    await page.fill('[data-testid="optimizations-version"]', "ver-auth");
    await page.click('[data-testid="optimizations-submit"]');

    const errorBox = page.locator('[data-testid="optimizations-error"]');
    await expect(errorBox).toBeVisible();
    await expect(errorBox).toContainText("未登录或会话已过期，请先登录。");
  });
});
