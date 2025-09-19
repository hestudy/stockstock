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

// 新增覆盖：导出成功（CSV/JSON）
test.describe("Backtests Detail — Export", () => {
  test("export CSV & JSON succeed and trigger downloads", async ({ page }) => {
    const jobId = "job-e2e-export";

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
          metrics: { return: 0.2, drawdown: 0.1, sharpe: 1.2 },
          equity: [
            { t: 0, v: 1 },
            { t: 1, v: 1.02 },
          ],
        }),
      });
    });

    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/backtests/${jobId}`);
    await expect(page.getByTestId("summary-cards")).toBeVisible({ timeout: 2000 });

    // 点击导出 CSV
    const downloadCsvPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出CSV" }).click();
    const downloadCsv = await downloadCsvPromise;
    expect(downloadCsv.suggestedFilename()).toContain(`backtest-${jobId}`);

    // 点击导出 JSON
    const downloadJsonPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "导出JSON" }).click();
    const downloadJson = await downloadJsonPromise;
    expect(downloadJson.suggestedFilename()).toContain(`backtest-${jobId}`);
  });
});

// 新增覆盖：错误与空态（failed/空结果）
test.describe("Backtests Detail — Error & Empty States", () => {
  test("failed status shows error message and actions", async ({ page }) => {
    const jobId = "job-e2e-failed";

    await page.route(/\/api\/v1\/backtests\/(.*)\/status/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ id: jobId, status: "failed", progress: 30 }),
      });
    });
    await page.route(/\/api\/v1\/backtests\/(.*)\/result/, async (route) => {
      await route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ error: { message: "not found" } }) });
    });

    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/backtests/${jobId}`);

    // 断言错误提示与入口（限定在错误区域，避免与页眉返回按钮冲突）
    const errorRegion = page.locator('[role="status"] .text-red-600');
    await expect(errorRegion.getByText(/作业失败/)).toBeVisible();
    await expect(errorRegion.getByRole("button", { name: "重试加载" })).toBeVisible();
    await expect(errorRegion.getByRole("button", { name: "返回列表" })).toBeVisible();
  });

  test("empty result renders placeholders and a11y roles present", async ({ page }) => {
    const jobId = "job-e2e-empty";

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
        body: JSON.stringify({ id: jobId, metrics: {}, equity: [] }),
      });
    });

    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/backtests/${jobId}`);

    // 摘要容器存在且显示占位骨架（直接断言骨架块可见）
    const skeleton = page.locator('[data-testid="summary-cards"] .animate-pulse');
    await expect(skeleton).toHaveCount(1);
    // a11y：页面包含 role="status" 与 aria-live="polite" 的区块
    const statusRegion = page.locator('[role="status"][aria-live="polite"]');
    await expect(statusRegion.first()).toBeVisible();
  });
});

