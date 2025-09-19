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
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ id: "job-1" });
  });

  it("400 on invalid id", async () => {
    (isValidBacktestId as any).mockReturnValue(false);
    const res = await GET(makeReq("http://localhost/api/v1/backtests/bad/status"), ctx("bad"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "INVALID_ID" } });
  });

  it("401 when unauthenticated", async () => {
    (getOwner as any).mockRejectedValue(new Error("nope"));
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "UNAUTHENTICATED" } });
  });

  it("429 when rate limited", async () => {
    (rateLimit as any).mockReturnValue({ allowed: false });
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "RATE_LIMITED" } });
  });

  it("500 on internal error (wrap)", async () => {
    // cause internal error by making rateLimit throw
    (rateLimit as any).mockImplementation(() => {
      const e: any = new Error("boom");
      e.status = 500;
      throw e;
    });
    const res = await GET(makeReq(), ctx("job-1"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "boom" } });
  });
});
