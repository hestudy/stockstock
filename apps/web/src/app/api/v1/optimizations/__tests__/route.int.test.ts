import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { POST } from "../route";
import { debugListJobs, debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

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
    resetVersionOwnershipStore();
  });

  afterEach(() => {
    process.env = origEnv as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  it("accepts a valid optimization submission", async () => {
    seedVersionOwnership("v-1", "test-owner");
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
    expect(jobs[0].ownerId).toBe("test-owner");
    expect(jobs[0].concurrencyLimit).toBe(4);
    expect(jobs[0].earlyStopPolicy).toEqual({ metric: "sharpe", threshold: 1.2, mode: "max" });
    expect(jobs[0].totalTasks).toBe(9);
    expect(res.headers.get("x-param-space-estimate")).toBe("9");
    expect(res.headers.get("x-concurrency-limit")).toBe("4");
  });

  it("rejects when param space exceeds limit", async () => {
    process.env.OPT_PARAM_SPACE_MAX = "3";
    seedVersionOwnership("v-1", "test-owner");
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

  it("rejects when version does not belong to owner", async () => {
    seedVersionOwnership("v-foreign", "other-owner");
    const body = {
      versionId: "v-foreign",
      paramSpace: { only: [1] },
    };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(403);
    const payload = (await res.json()) as any;
    expect(payload.error.code).toBe("E.FORBIDDEN");
  });

  it("propagates remote orchestrator validation errors", async () => {
    seedVersionOwnership("v-remote", "test-owner");
    process.env.OPTIMIZATION_ORCHESTRATOR_URL = "http://remote";
    process.env.OPTIMIZATION_ORCHESTRATOR_SECRET = "top-secret";

    const remoteBody = {
      detail: {
        code: "E.PARAM_INVALID",
        message: "param space too large",
        details: { limit: 32, estimate: 40 },
      },
    };

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(
        new Response(JSON.stringify(remoteBody), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      );

    const body = {
      versionId: "v-remote",
      paramSpace: { only: [1, 2] },
    };

    try {
      const res = await POST(makeRequest(body));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(400);
      const payload = (await res.json()) as any;
      expect(payload.error.code).toBe("E.PARAM_INVALID");
      expect(payload.error.details.limit).toBe(32);
      expect(payload.error.message).toBe("param space too large");
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it("returns remote orchestrator success response", async () => {
    seedVersionOwnership("v-remote-ok", "test-owner");
    process.env.OPTIMIZATION_ORCHESTRATOR_URL = "http://remote";
    process.env.OPTIMIZATION_ORCHESTRATOR_SECRET = "top-secret";

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_input, init) => {
        const requestInit = init ?? {};
        const headers = (requestInit.headers ?? {}) as Record<string, string>;
        expect(headers["x-owner-id"]).toBe("test-owner");
        expect(requestInit.method).toBe("POST");
        const body = JSON.parse(requestInit.body as string);
        expect(body.versionId).toBe("v-remote-ok");
        return new Response(JSON.stringify({ id: "remote-job", status: "queued" }), {
          status: 202,
          headers: { "content-type": "application/json" },
        });
      });

    const body = {
      versionId: "v-remote-ok",
      paramSpace: { p1: [1], p2: [2] },
    };

    try {
      const res = await POST(makeRequest(body));
      expect(fetchSpy).toHaveBeenCalledTimes(1);
      expect(res.status).toBe(202);
      const payload = (await res.json()) as any;
      expect(payload.id).toBe("remote-job");
      expect(payload.status).toBe("queued");
      expect(debugListJobs()).toHaveLength(0);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
