// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "../app/api/ready/route";

describe("GET /api/ready", () => {
  function mkReq(ip = "127.0.0.1") {
    return new Request("http://localhost/api/ready", {
      headers: { "x-real-ip": ip },
    });
  }

  it("returns 200 and ready structure", async () => {
    const res = await GET(mkReq("10.1.0.1"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty("service", "api");
    expect(body).toHaveProperty("status", "ready");
    expect(body).toHaveProperty("checks");
    expect(body?.checks?.self).toBe(true);
    expect(body).toHaveProperty("ts");
  });
});
