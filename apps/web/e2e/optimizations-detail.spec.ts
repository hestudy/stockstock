import { test, expect } from "@playwright/test";

const JOB_ID = "opt-e2e-detail";

const STATUS_PAYLOAD = {
  id: JOB_ID,
  status: "running",
  totalTasks: 6,
  concurrencyLimit: 2,
  summary: {
    total: 6,
    finished: 2,
    running: 2,
    throttled: 2,
    topN: [
      { taskId: "task-high", score: 1.4215 },
      { taskId: "task-mid", score: 1.2104 },
      { taskId: "task-low", score: 0.9821 },
    ],
  },
  diagnostics: {
    throttled: true,
    queueDepth: 3,
    running: 2,
  },
};

test.describe("Optimizations Detail — Top-N & Throttle", () => {
  test("renders throttling banner and sorted topN table", async ({ page }) => {
    // 拦截状态轮询，提供稳定的返回数据
    await page.route(
      new RegExp(`/api/v1/optimizations/${JOB_ID}/status`),
      async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(STATUS_PAYLOAD),
        });
      },
    );

    // 鉴权绕过（参照其他 E2E 用例）
    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/optimizations/${JOB_ID}`);

    const detail = page.getByTestId("optimizations-detail");
    await expect(detail).toBeVisible();

    const throttleBanner = page.getByTestId("optimizations-throttle-banner");
    await expect(throttleBanner).toBeVisible();
    await expect(throttleBanner).toContainText("节流中");

    const summary = page.getByTestId("optimizations-summary");
    await expect(summary).toContainText("总任务");
    await expect(summary).toContainText("6");
    await expect(summary).toContainText("排队节流");

    const rows = page.getByTestId("optimizations-topn").locator("tbody tr");
    await expect(rows).toHaveCount(3);

    const first = rows.nth(0);
    await expect(first).toContainText("#1");
    await expect(first).toContainText("task-high");
    await expect(first).toContainText("1.4215");

    const second = rows.nth(1);
    await expect(second).toContainText("#2");
    await expect(second).toContainText("task-mid");
    await expect(second).toContainText("1.2104");

    const third = rows.nth(2);
    await expect(third).toContainText("#3");
    await expect(third).toContainText("task-low");
    await expect(third).toContainText("0.9821");

    // 验证初始渲染无错误信息
    await expect(page.getByTestId("optimizations-detail-error")).toHaveCount(0);
  });
});
