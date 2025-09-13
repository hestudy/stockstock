// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { submitBacktest } from "../services/backtests";
import type { BacktestSubmitRequest, BacktestSubmitResponse } from "@shared/backtest";

const g: any = globalThis as any;

describe("services/backtests.submitBacktest", () => {
  beforeEach(() => {
    g.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("attaches clientRequestId and returns response on success", async () => {
    const payload = { id: "job-1", status: "queued" } as BacktestSubmitResponse;
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });

    const req: Omit<BacktestSubmitRequest, "clientRequestId"> = {
      versionId: "v1",
      params: { a: 1 },
    };

    const res = await submitBacktest(req);
    expect(res.id).toBe("job-1");

    // Inspect the request body sent to fetch
    expect(g.fetch as any).toHaveBeenCalledTimes(1);
    const call = (g.fetch as any).mock.calls[0];
    const body = JSON.parse(call[1].body as string);
    expect(body.versionId).toBe("v1");
    expect(body.params.a).toBe(1);
    expect(typeof body.clientRequestId).toBe("string");
    expect(body.clientRequestId.length).toBeGreaterThan(0);
  });

  it("propagates apiClient error for non-2xx (e.g., 429/500)", async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 429,
      json: () => Promise.resolve({ error: { message: "Too Many Requests" } }),
    });

    await expect(submitBacktest({ versionId: "v1", params: {} })).rejects.toThrow(
      /Too Many Requests|HTTP 429/,
    );
  });

  it("propagates apiClient error for HTTP 500 when no json body", async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("no json")),
    });
    await expect(submitBacktest({ versionId: "v1", params: {} })).rejects.toThrow(/HTTP 500/);
  });

  it("propagates timeout/network rejection errors", async () => {
    (g.fetch as any).mockRejectedValue(new Error("Request timed out"));
    await expect(submitBacktest({ versionId: "v1", params: {} })).rejects.toThrow(
      /timed out|timeout/i,
    );
  });
});

