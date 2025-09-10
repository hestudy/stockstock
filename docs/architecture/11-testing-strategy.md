## Testing Strategy

### Testing Pyramid

- E2E（少量关键路径）
- Integration（接口、服务层、仓储）
- Frontend Unit / Backend Unit（数量最多，执行最快）

目标

- 覆盖率：单元+集成总覆盖率 ≥70%，关键模块 ≥80%
- 关键路径 E2E：登录 → 提交 → 结果摘要 2s 内可见

### Test Organization

- Frontend（apps/web）
  - 工具：Vitest + React Testing Library
  - 目录：`apps/web/src/{components|hooks|utils}/__tests__/*.test.ts(x)`
  - 命令：`npm run -w apps/web test`
- Backend（API TS + Python）
  - TS：Jest + supertest；目录 `apps/web/src/app/api/**/__tests__/*.test.ts`
  - Python：Pytest；目录 `services/backtest/tests/test_*.py`
- E2E（Playwright）
  - 目录：`e2e/*.spec.ts`
  - 命令：`npx playwright test`

### Examples

```ts
// apps/web/src/components/charts/__tests__/EquityCurve.test.tsx
import { render } from "@testing-library/react";
import { EquityCurve } from "../EquityCurve";
test("renders equity curve", () => {
  render(<EquityCurve series={[{ time: "2024-01-01", value: 1 }]} />);
});
```

```ts
// apps/web/src/app/api/backtests/__tests__/submit.test.ts
import handler from "../route";
import { NextRequest } from "next/server";
it("accepts valid payload", async () => {
  const req = new NextRequest("http://test/api/v1/backtests", {
    method: "POST",
    body: JSON.stringify({
      versionId: "uuid",
      params: { start: "2020-01-01" },
    }),
    headers: {
      "content-type": "application/json",
      authorization: "Bearer fake",
    },
  });
  const res = await handler(req);
  expect(res.status).toBe(202);
});
```

```py
# services/backtest/tests/test_worker.py
from app.workers.worker import run_backtest

def test_run_backtest_basic(monkeypatch):
    def fake_fetch(symbol, timeframe, start, end):
        return [("2020-01-01", 1.0)]
    monkeypatch.setattr("app.adapters.tushare.fetch_klines", fake_fetch)
    result = run_backtest(version_id="uuid", params={"symbol": "000001.SZ"})
    assert "metrics" in result
```

```ts
// e2e/backtest.spec.ts
import { test, expect } from "@playwright/test";
test("login -> submit -> summary in 2s", async ({ page }) => {
  await page.goto("/");
  // ... 登录步骤略
  await page.goto("/backtests");
  // ... 提交回测并跳转详情
  const start = Date.now();
  await page.getByTestId("summary-cards").waitFor();
  expect(Date.now() - start).toBeLessThan(2000);
});
```

### 质量门禁

- CI：单元/集成 + Lint + TypeCheck 必须通过；E2E 在 main 与发布前执行
- 覆盖率：前后端分别出报告并汇总
- Flaky 用例：打标签与重试，定期治理
