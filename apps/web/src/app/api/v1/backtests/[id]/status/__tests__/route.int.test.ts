import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

// Mock dependencies used by the route
vi.mock("../../../../../_lib/auth", () => ({
  getOwner: vi.fn(async () => ({ ownerId: "user-1" })),
}));

vi.mock("../../../../../_lib/rateLimit", () => ({
  rateLimit: vi.fn(() => ({ allowed: true, remaining: 1, resetAt: Date.now() + 1000 })),
}));

vi.mock("../../../../../_lib/validate", () => ({
  isValidBacktestId: vi.fn(() => true),
}));

const origEnv = { ...process.env } as any;

describe("api/v1/backtests/[id]/status route metrics integration", () => {
  let spy: any;
  beforeEach(() => {
    process.env = { ...origEnv, OBS_ENABLED: "true", NODE_ENV: "test" } as any;
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    process.env = origEnv as any;
  });

  it("emits metrics on success", async () => {
    const req = new Request("http://localhost/api/v1/backtests/abc/status", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(200);
    // First call should be [METRICS]
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({
      kind: "http_server",
      route: "/api/v1/backtests/[id]/status",
      method: "GET",
      status: 200,
    });
    expect(typeof payload.duration_ms).toBe("number");
    expect(payload.exporter).toBe("console");
  });

  it("emits metrics with 401 on unauthenticated", async () => {
    const { getOwner } = await import("../../../../../_lib/auth");
    (getOwner as any).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));

    (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    const req = new Request("http://localhost/api/v1/backtests/abc/status", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(401);
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({ status: 401 });
    expect(typeof payload.duration_ms).toBe("number");
    expect(payload.exporter).toBe("otlp");
  });

  it("emits metrics with 429 when rate limited", async () => {
    const { rateLimit } = await import("../../../../../_lib/rateLimit");
    (rateLimit as any).mockReturnValueOnce({
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 1000,
    });

    const req = new Request("http://localhost/api/v1/backtests/abc/status", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(429);
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({ status: 429 });
    expect(typeof payload.duration_ms).toBe("number");
    expect(payload.exporter).toBe("console");
  });

  it("emits metrics with 503 when internal error occurs", async () => {
    const { isValidBacktestId } = await import("../../../../../_lib/validate");
    (isValidBacktestId as any).mockImplementationOnce(() => {
      const err: any = new Error("DB_DOWN");
      err.status = 503;
      throw err;
    });

    (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";

    const req = new Request("http://localhost/api/v1/backtests/abc/status", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(503);
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({ status: 503 });
    expect(typeof payload.duration_ms).toBe("number");
    expect(payload.exporter).toBe("otlp");
  });
});
