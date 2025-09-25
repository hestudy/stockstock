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

const EARLY_STOP_PAYLOAD = {
  id: JOB_ID,
  status: "early-stopped",
  totalTasks: 6,
  concurrencyLimit: 2,
  summary: {
    total: 6,
    finished: 6,
    running: 0,
    throttled: 0,
    topN: [
      { taskId: "task-low", score: 0.45 },
      { taskId: "task-mid", score: 0.55 },
      { taskId: "task-high", score: 0.63 },
    ],
  },
  diagnostics: {
    throttled: false,
    queueDepth: 0,
    running: 0,
    final: true,
    stopReason: {
      kind: "EARLY_STOP_THRESHOLD",
      metric: "drawdown",
      threshold: 0.6,
      score: 0.45,
      mode: "min",
    },
  },
};

const CANCELED_PAYLOAD = {
  id: JOB_ID,
  status: "canceled",
  totalTasks: 6,
  concurrencyLimit: 2,
  summary: {
    total: 6,
    finished: 3,
    running: 0,
    throttled: 0,
    topN: [
      { taskId: "task-low", score: 0.45 },
      { taskId: "task-mid", score: 0.55 },
      { taskId: "task-high", score: 0.63 },
    ],
  },
  diagnostics: {
    throttled: false,
    queueDepth: 0,
    running: 0,
    final: true,
    stopReason: {
      kind: "CANCELED",
      reason: "manual",
    },
  },
};

const NEW_JOB_ID = "opt-e2e-detail-rerun";

const RERUN_STATUS_PAYLOAD = {
  id: NEW_JOB_ID,
  status: "queued",
  totalTasks: 6,
  concurrencyLimit: 2,
  summary: {
    total: 6,
    finished: 0,
    running: 0,
    throttled: 0,
    topN: [
      { taskId: "task-new", score: 1.01 },
    ],
  },
  diagnostics: {
    throttled: false,
    queueDepth: 0,
    running: 0,
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

test.describe("Optimizations Detail — Early Stop & Cancel", () => {
  test("updates status to early stop and hides throttle banner after refresh", async ({ page }) => {
    let hitCount = 0;
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/status`), async (route) => {
      const payload = hitCount === 0 ? STATUS_PAYLOAD : EARLY_STOP_PAYLOAD;
      hitCount += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });

    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/optimizations/${JOB_ID}`);

    const statusMetric = page.getByTestId("metric-状态");
    await expect(statusMetric).toContainText("执行中");
    await expect(page.getByTestId("optimizations-throttle-banner")).toBeVisible();

    await page.getByRole("button", { name: "立即刷新" }).click();

    await expect(statusMetric).toContainText("提前停止");
    await expect(page.getByTestId("optimizations-throttle-banner")).toHaveCount(0);

    const rows = page.getByTestId("optimizations-topn").locator("tbody tr");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("task-low");
    await expect(rows.first()).toContainText("0.4500");
  });
});

test.describe("Optimizations Detail — Cancel Flow", () => {
  test("cancels job and surfaces final diagnostics", async ({ page }) => {
    let currentStatus = STATUS_PAYLOAD;

    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/status`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(currentStatus),
      });
    });

    await page.route(
      new RegExp(`/api/v1/optimizations/${JOB_ID}/cancel`),
      async (route) => {
        currentStatus = CANCELED_PAYLOAD;
        await route.fulfill({
          status: 202,
          contentType: "application/json",
          body: JSON.stringify(CANCELED_PAYLOAD),
        });
      },
    );

    await page.context().addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);

    await page.goto(`/optimizations/${JOB_ID}`);

    await expect(page.getByTestId("metric-状态")).toContainText("执行中");

    const cancelButton = page.getByTestId("optimizations-cancel");
    await expect(cancelButton).toBeEnabled();
    await cancelButton.click();

    await expect(page.getByTestId("optimizations-detail-notice")).toContainText(
      "取消请求",
    );
    await expect(page.getByTestId("metric-状态")).toContainText("已取消");
    await expect(page.getByTestId("optimizations-throttle-banner")).toHaveCount(0);
    await expect(cancelButton).toBeDisabled();
  });
});

test.describe("Optimizations Detail — Export & Rerun", () => {
  test.beforeEach(async ({ page, context }) => {
    await context.addCookies([
      { name: "e2e_auth_bypass", value: "1", domain: "localhost", path: "/" },
    ]);
    await page.addInitScript(() => {
      if (typeof URL.createObjectURL !== "function") {
        URL.createObjectURL = () => "blob:mock";
      }
      if (typeof URL.revokeObjectURL !== "function") {
        URL.revokeObjectURL = () => {};
      }
    });
  });

  test("exports bundle then reruns and redirects to new job", async ({ page }) => {
    let statusHit = 0;
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/status`), async (route) => {
      const payload = statusHit === 0 ? STATUS_PAYLOAD : EARLY_STOP_PAYLOAD;
      statusHit += 1;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    });
    await page.route(new RegExp(`/api/v1/optimizations/${NEW_JOB_ID}/status`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(RERUN_STATUS_PAYLOAD),
      });
    });
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/export`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          jobId: JOB_ID,
          status: "succeeded",
          generatedAt: new Date().toISOString(),
          summary: STATUS_PAYLOAD.summary,
          items: [],
        }),
      });
    });
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/rerun`), async (route) => {
      await route.fulfill({
        status: 202,
        contentType: "application/json",
        body: JSON.stringify({ id: NEW_JOB_ID, status: "queued", sourceJobId: JOB_ID }),
      });
    });

    await page.goto(`/optimizations/${JOB_ID}`);

    await expect(page.getByTestId("optimizations-detail")).toBeVisible();

    await page.getByRole("button", { name: "立即刷新" }).click();
    await expect(page.getByTestId("metric-状态")).toContainText("提前停止");

    await page.getByTestId("optimizations-export").click();
    await expect(page.getByTestId("optimizations-detail-notice")).toContainText("Top-N 聚合包");

    await page.getByTestId("optimizations-rerun").click();
    await page.waitForURL(new RegExp(`/optimizations/${NEW_JOB_ID}$`));
    await expect(page.getByTestId("optimizations-job-id")).toContainText(NEW_JOB_ID);

    await page.route(/\/api\/v1\/optimizations\/history.*/, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify([
          {
            id: NEW_JOB_ID,
            ownerId: "owner-1",
            versionId: "v-history",
            paramSpace: { sample: true },
            concurrencyLimit: 2,
            earlyStopPolicy: null,
            status: "queued",
            totalTasks: RERUN_STATUS_PAYLOAD.totalTasks,
            summary: RERUN_STATUS_PAYLOAD.summary,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            sourceJobId: JOB_ID,
          },
        ]),
      });
    });

    await page.goto("/optimizations");
    const highlightRow = page.getByTestId(`optimizations-history-row-${NEW_JOB_ID}`);
    await expect(highlightRow).toContainText(NEW_JOB_ID);
  });

  test("surfaces export and rerun errors without breaking UI", async ({ page }) => {
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/status`), async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(STATUS_PAYLOAD),
      });
    });
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/export`), async (route) => {
      await route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "E.INTERNAL", message: "export failure" },
        }),
      });
    });
    await page.route(new RegExp(`/api/v1/optimizations/${JOB_ID}/rerun`), async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "E.DEP_UPSTREAM", message: "rerun busy" },
        }),
      });
    });

    await page.goto(`/optimizations/${JOB_ID}`);

    await expect(page.getByTestId("optimizations-detail")).toBeVisible();

    await page.getByTestId("optimizations-export").click();
    await expect(page.getByTestId("optimizations-export-error")).toContainText("服务暂不可用");

    await page.getByTestId("optimizations-rerun").click();
    await expect(page.getByTestId("optimizations-rerun-error")).toContainText("服务暂不可用");
    await expect(page.getByTestId("optimizations-detail")).toBeVisible();
  });
});
