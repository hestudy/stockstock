// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitOptimization, cancelOptimization } from "../services/optimizations";
import type {
  OptimizationStatus,
  OptimizationSubmitRequest,
  OptimizationSubmitResponse,
} from "@shared/index";

const g: any = globalThis as any;

describe("services/optimizations.submitOptimization", () => {
  beforeEach(() => {
    g.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("调用 API 并返回作业信息", async () => {
    const payload: OptimizationSubmitResponse = { id: "opt-123", status: "queued" };
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });

    const body: OptimizationSubmitRequest = {
      versionId: "v-opt",
      paramSpace: { a: [1, 2] },
      concurrencyLimit: 4,
      earlyStopPolicy: { metric: "sharpe", threshold: 1.5, mode: "max" },
    };

    const res = await submitOptimization(body);
    expect(res).toEqual(payload);

    expect(g.fetch as any).toHaveBeenCalledTimes(1);
    const [, init] = (g.fetch as any).mock.calls[0];
    const sent = JSON.parse(init.body);
    expect(sent.versionId).toBe("v-opt");
    expect(sent.paramSpace.a).toEqual([1, 2]);
    expect(sent.concurrencyLimit).toBe(4);
    expect(sent.earlyStopPolicy.metric).toBe("sharpe");
  });

  it("将非 2xx 响应转化为 ApiClientError", async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 401,
      json: () => Promise.resolve({ error: { code: "E.AUTH", message: "authentication required" } }),
    });

    await expect(
      submitOptimization({ versionId: "v-opt", paramSpace: { only: [1] } }),
    ).rejects.toThrow(/authentication required|HTTP 401/i);
  });
});

describe("services/optimizations.cancelOptimization", () => {
  beforeEach(() => {
    g.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("发送取消请求并返回最新状态", async () => {
    const payload: OptimizationStatus = {
      id: "opt-1",
      status: "canceled",
      totalTasks: 4,
      concurrencyLimit: 2,
      summary: {
        total: 4,
        finished: 2,
        running: 0,
        throttled: 0,
        topN: [],
      },
      diagnostics: { throttled: false, queueDepth: 0, running: 0, final: true },
    };
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });

    const res = await cancelOptimization("opt-1", "manual");
    expect(res).toEqual(payload);
    expect(g.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (g.fetch as any).mock.calls[0];
    expect(url).toContain("/optimizations/opt-1/cancel");
    expect(JSON.parse(init.body)).toEqual({ reason: "manual" });
  });

  it("当取消失败时抛出异常", async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: { code: "E.NOT_FOUND", message: "missing" } }),
    });

    await expect(cancelOptimization("opt-missing")).rejects.toThrow(/missing|404/i);
  });
});
