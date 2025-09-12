// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getHealth, type HealthResponse } from "../services/health";

const g: any = globalThis as any;

describe("services/health", () => {
  beforeEach(() => {
    g.fetch = vi.fn();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("getHealth returns HealthResponse on success", async () => {
    const payload: HealthResponse = {
      service: "api",
      status: "up",
      details: { api: "up" },
      ts: new Date().toISOString(),
    };
    (g.fetch as any).mockResolvedValue({ ok: true, json: () => Promise.resolve(payload) });
    const res = await getHealth();
    expect(res.service).toBe("api");
    expect(["up", "degraded", "down"]).toContain(res.status);
    expect(typeof res.ts).toBe("string");
  });

  it("propagates apiClient error on non-2xx", async () => {
    (g.fetch as any).mockResolvedValue({
      ok: false,
      status: 500,
      json: () => Promise.reject(new Error("no json")),
    });
    await expect(getHealth()).rejects.toThrow("HTTP 500");
  });
});
