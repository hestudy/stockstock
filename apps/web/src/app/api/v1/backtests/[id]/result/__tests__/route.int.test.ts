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

describe("api/v1/backtests/[id]/result route metrics integration", () => {
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
    const req = new Request("http://localhost/api/v1/backtests/abc/result", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(200);
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({
      kind: "http_server",
      route: "/api/v1/backtests/[id]/result",
      method: "GET",
      status: 200,
    });
  });

  it("emits metrics with 401 on unauthenticated", async () => {
    const { getOwner } = await import("../../../../../_lib/auth");
    (getOwner as any).mockRejectedValueOnce(new Error("UNAUTHENTICATED"));

    const req = new Request("http://localhost/api/v1/backtests/abc/result", { method: "GET" });
    const res = await GET(req as any, { params: { id: "abc" } });
    expect(res.status).toBe(401);
    const call = spy.mock.calls.find((c: any[]) => c[0] === "[METRICS]");
    expect(call).toBeTruthy();
    const payload = call?.[1];
    expect(payload).toMatchObject({ status: 401 });
  });
});
