// @vitest-environment node
import { describe, it, expect } from "vitest";
import { GET } from "../app/api/v1/health/route";

describe("GET /api/v1/health", () => {
  it("returns 200 and expected structure", async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body).toHaveProperty("service");
    expect(["up", "degraded", "down"]).toContain(body.status);
    expect(body).toHaveProperty("details");
    expect(body).toHaveProperty("ts");
  });
});
