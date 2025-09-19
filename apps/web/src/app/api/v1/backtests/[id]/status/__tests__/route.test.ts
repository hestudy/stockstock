import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { GET } from "../route";

// Mocks for auth/rateLimit/validate
vi.mock("../../../../../_lib/auth", () => ({
  getOwner: vi.fn(),
}));
vi.mock("../../../../../_lib/rateLimit", () => ({
  rateLimit: vi.fn(),
}));
vi.mock("../../../../../_lib/validate", () => ({
  isValidBacktestId: vi.fn(),
}));

const { getOwner } = await import("../../../../../_lib/auth");
const { rateLimit } = await import("../../../../../_lib/rateLimit");
const { isValidBacktestId } = await import("../../../../../_lib/validate");

function makeReq(url = "http://localhost/api/v1/backtests/abc/status"): Request {
  return new Request(url);
}

function ctx(id = "abc") {
  return { params: { id } } as any;
}

describe("status route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    (isValidBacktestId as any).mockReturnValue(true);
    (getOwner as any).mockResolvedValue({ ownerId: "user-1" });
    (rateLimit as any).mockReturnValue({ allowed: true });
  });
  afterEach(() => vi.resetAllMocks());

  it("200 OK on happy path", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    delete (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT;
    (process.env as any).OBS_ENABLED = "true";
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "job-1" });
    const payload = (spy.mock.calls.at(-1) as any)?.[1];
    expect(payload).toMatchObject({ kind: "http_server", route: "/api/v1/backtests/[id]/status", method: "GET", status: 200 });
    expect(payload.exporter).toBe("console");
    expect(typeof payload.duration_ms).toBe("number");
    expect(payload.duration_ms).toBeGreaterThanOrEqual(0);
    spy.mockRestore();
  });

  it("400 on invalid id", async () => {
    (isValidBacktestId as any).mockReturnValue(false);
    const res = await GET(makeReq("http://localhost/api/v1/backtests/bad/status"), ctx("bad"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "INVALID_ID" } });
  });

  it("401 when unauthenticated", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    delete (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT;
    (process.env as any).OBS_ENABLED = "true";
    (getOwner as any).mockRejectedValue(new Error("nope"));
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "UNAUTHENTICATED" } });
    const payload = (spy.mock.calls.at(-1) as any)?.[1];
    expect(payload).toMatchObject({ status: 401 });
    expect(payload.exporter).toBe("console");
    expect(typeof payload.duration_ms).toBe("number");
    spy.mockRestore();
  });

  it("429 when rate limited", async () => {
    (rateLimit as any).mockReturnValue({ allowed: false });
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "RATE_LIMITED" } });
  });

  it("500 on internal error (wrap)", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    delete (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT;
    (process.env as any).OBS_ENABLED = "true";
    (rateLimit as any).mockImplementation(() => {
      const e: any = new Error("boom");
      e.status = 500;
      throw e;
    });
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "boom" } });
    const payload = (spy.mock.calls.at(-1) as any)?.[1];
    expect(payload).toMatchObject({ status: 500 });
    expect(payload.exporter).toBe("console");
    expect(typeof payload.duration_ms).toBe("number");
    spy.mockRestore();
  });

  it("uses exporter=otlp when OTEL endpoint configured", async () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    (process.env as any).OBS_ENABLED = "true";
    const res = await GET(makeReq(), ctx("job-2"));
    expect(res.status).toBe(200);
    const payload = (spy.mock.calls.at(-1) as any)?.[1];
    expect(payload.exporter).toBe("otlp");
    spy.mockRestore();
  });
});
