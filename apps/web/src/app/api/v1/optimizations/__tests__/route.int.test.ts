import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "../route";
import { debugListJobs, debugResetJobs } from "../orchestratorClient";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makeRequest(body: any) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v1/optimizations", () => {
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: "test",
      OBS_ENABLED: "false",
      E2E_AUTH_BYPASS: "1",
      OPT_PARAM_SPACE_MAX: "32",
    } as any;
    debugResetJobs();
  });

  afterEach(() => {
    process.env = origEnv as any;
    debugResetJobs();
  });

  it("accepts a valid optimization submission", async () => {
    const body = {
      versionId: "v-1",
      paramSpace: {
        ma_short: [5, 10, 20],
        ma_long: { start: 50, end: 60, step: 5 },
      },
      concurrencyLimit: 4,
      earlyStopPolicy: { metric: "sharpe", threshold: 1.2, mode: "max" },
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(202);
    const payload = (await res.json()) as any;
    expect(payload).toHaveProperty("id");
    expect(payload.status).toBe("queued");
    const jobs = debugListJobs();
    expect(jobs).toHaveLength(1);
    expect(jobs[0].totalTasks).toBe(9);
    expect(res.headers.get("x-param-space-estimate")).toBe("9");
    expect(res.headers.get("x-concurrency-limit")).toBe("4");
  });

  it("rejects when param space exceeds limit", async () => {
    process.env.OPT_PARAM_SPACE_MAX = "3";
    const body = {
      versionId: "v-1",
      paramSpace: {
        p1: [1, 2],
        p2: [3, 4],
      },
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(400);
    const payload = (await res.json()) as any;
    expect(payload.error.code).toBe("E.PARAM_INVALID");
    expect(payload.error.details.limit).toBe(3);
  });

  it("returns 401 when authentication fails", async () => {
    debugResetJobs();
    delete process.env.E2E_AUTH_BYPASS;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const body = { versionId: "v", paramSpace: { x: [1] } };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
    const payload = (await res.json()) as any;
    expect(payload.error.code).toBe("E.AUTH");
  });
});
