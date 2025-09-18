import { test, expect } from "@playwright/test";

// 说明：该用例拦截状态与结果接口，确保在 2 秒内看到摘要区域渲染完成。
// 依赖应用以 dev 或 start 方式运行，并在 playwright 配置的 baseURL 下可访问。

test.describe("Backtests Detail — Summary within 2 seconds", () => {
  test("summary visible within 2s", async ({ page }) => {
    const jobId = "job-e2e-1";

    await page.route(/\/api\/v1\/backtests\/(.*)\/status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: jobId, status: "succeeded", progress: 100 }),
      });
    });

    await page.route(/\/api\/v1\/backtests\/(.*)\/result/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          id: jobId,
          metrics: { return: 0.12, drawdown: 0.05, sharpe: 1.4 },
          equity: [
            { t: 0, v: 1 },
            { t: 1, v: 1.01 },
          ],
        }),
      });
    });

    // 鉴权绕过（仅本用例）：设置 cookie 以跳过 (dashboard) 布局的 supabase 校验
    await page.context().addCookies([
      {
        name: "e2e_auth_bypass",
        value: "1",
        domain: "localhost",
        path: "/",
        httpOnly: false,
        secure: false,
        sameSite: "Lax",
      },
    ]);

    const start = Date.now();
    await page.goto(`/backtests/${jobId}`);

    // 断言：摘要区域在 2 秒内可见
    const container = page.getByTestId("summary-cards");
    await expect(container).toBeVisible({ timeout: 2000 });

    // 可选：检查摘要文字是否渲染
    await expect(page.getByText("夏普")).toBeVisible();

    const elapsed = Date.now() - start;
    console.log(`Summary visible in ${elapsed}ms`);
  });
});

