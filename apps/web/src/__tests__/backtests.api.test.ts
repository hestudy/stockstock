// @vitest-environment node
import { describe, it, expect, beforeAll } from "vitest";
import { POST } from "../app/api/v1/backtests/route";

function mkReq(body: any, ip = "127.0.0.1") {
  return new Request("http://localhost/api/v1/backtests", {
    method: "POST",
    headers: { "x-real-ip": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/backtests", () => {
  beforeAll(() => {
    process.env.E2E_AUTH_BYPASS = "1";
  });
  it("returns 202 with {id,status} on valid payload", async () => {
    const res = await POST(
      mkReq({ versionId: "v1", params: { a: 1 }, clientRequestId: "c-1" }, "10.0.0.9"),
    );
    expect(res.status).toBe(202);
    const body = (await res.json()) as any;
    expect(typeof body.id).toBe("string");
    expect(["queued", "running", "succeeded", "failed"]).toContain(body.status);
  });

  it("returns 400 on invalid payload", async () => {
    const res = await POST(mkReq({ bad: true }, "10.0.0.10"));
    expect(res.status).toBe(400);
  });

  it("rate limits after several requests (429)", async () => {
    const ip = "10.0.0.11";
    // LIMIT is 5 within window; 6th should be 429
    const r1 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    const r2 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    const r3 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    const r4 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    const r5 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    const r6 = await POST(mkReq({ versionId: "v1", params: {} }, ip));
    expect(r1.status).toBe(202);
    expect(r2.status).toBe(202);
    expect(r3.status).toBe(202);
    expect(r4.status).toBe(202);
    expect(r5.status).toBe(202);
    expect(r6.status).toBe(429);
  });

  it("returns same id for same clientRequestId within idempotency window", async () => {
    const ip = "10.0.0.12";
    const body = { versionId: "v2", params: { x: 1 }, clientRequestId: "idem-1" };
    const r1 = await POST(mkReq(body, ip));
    const b1 = (await r1.json()) as any;
    const r2 = await POST(mkReq(body, ip));
    const b2 = (await r2.json()) as any;
    expect(b1.id).toBeTypeOf("string");
    expect(b1.id).toBe(b2.id);
  });
});
