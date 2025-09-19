import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "../route";

const origEnv = { ...process.env } as any;

function makeRequest(ip = "127.0.0.1", body: any = { versionId: "v1", params: {} }) {
  return new Request("http://localhost/api/v1/backtests", {
    method: "POST",
    headers: { "x-forwarded-for": ip, "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as any;
}

describe("api/v1/backtests submit rate limit integration", () => {
  beforeEach(() => {
    process.env = { ...origEnv, NODE_ENV: "test", OBS_ENABLED: "true", E2E_AUTH_BYPASS: "1" } as any;
  });
  afterEach(() => {
    process.env = origEnv as any;
  });

  it("returns 429 when exceeding rate limit window", async () => {
    delete (process.env as any).RATE_LIMIT_DISABLED; // ensure enabled
    const ip = "10.0.0.1";
    let last: Response | undefined;
    // limit is 5 per 10s window; perform 6 requests
    for (let i = 0; i < 6; i++) {
      const req = makeRequest(ip);
      const res = await POST(req);
      last = res as any;
      // first 5 should be non-429 (202 or 400 depending on body), 6th should be 429
    }
    expect(last).toBeDefined();
    expect((last as Response).status).toBe(429);
  });

  it("does not rate limit when RATE_LIMIT_DISABLED=1", async () => {
    process.env.RATE_LIMIT_DISABLED = "1";
    const ip = "10.0.0.2";
    let blocked = 0;
    for (let i = 0; i < 10; i++) {
      const req = makeRequest(ip);
      const res = await POST(req);
      if (res.status === 429) blocked++;
    }
    expect(blocked).toBe(0);
  });
});
