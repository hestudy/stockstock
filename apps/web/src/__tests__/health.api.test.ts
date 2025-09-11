// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "../app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  function mkReq(ip = "127.0.0.1") {
    return new Request("http://localhost/api/v1/health", {
      headers: { "x-real-ip": ip },
    });
  }

  it("returns 200 and expected structure", async () => {
    const res = await GET(mkReq("10.0.0.1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty("service");
    expect(["up", "degraded", "down"]).toContain(body.status);
    expect(body).toHaveProperty("details");
    expect(body).toHaveProperty("ts");
  });

  it("rate limits repeated requests and returns 429 after limit", async () => {
    const ip = "10.0.0.2";
    const req = mkReq(ip);
    // LIMIT is 3 within 10s window; 4th should be 429
    const r1 = await GET(req);
    const r2 = await GET(req);
    const r3 = await GET(req);
    const r4 = await GET(req);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r3.status).toBe(200);
    expect(r4.status).toBe(429);
    const body = (await r4.json()) as any;
    expect(body?.error?.reason).toBe("rate_limited");
  });
});
