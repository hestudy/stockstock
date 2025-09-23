// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitOptimization } from "../services/optimizations";
import type { OptimizationSubmitRequest, OptimizationSubmitResponse } from "@shared/index";

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
