import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "../route";
import { GET } from "../[id]/status/route";
import { debugListJobs, debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makePost(body: any) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeGet(id: string) {
  return new Request(`http://localhost/api/v1/optimizations/${id}/status`, {
    method: "GET",
  });
}

describe("GET /api/v1/optimizations/:id/status", () => {
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: "test",
      OBS_ENABLED: "false",
      E2E_AUTH_BYPASS: "1",
      OPT_PARAM_SPACE_MAX: "64",
    } as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  afterEach(() => {
    process.env = origEnv as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  it("returns aggregated status with summary counts", async () => {
    seedVersionOwnership("v-status", "test-owner");
    const postRes = await POST(
      makePost({
        versionId: "v-status",
        paramSpace: {
          short: [1, 2],
          long: [3, 4, 5],
        },
        concurrencyLimit: 2,
      }),
    );
    expect(postRes.status).toBe(202);
    const { id } = (await postRes.json()) as { id: string };

    const res = await GET(makeGet(id) as any, { params: { id } });
    expect(res.status).toBe(200);
    const payload = (await res.json()) as any;
    expect(payload).toMatchObject({
      id,
      status: "queued",
      totalTasks: 6,
      concurrencyLimit: 2,
      diagnostics: {
        throttled: true,
        queueDepth: 4,
      },
    });
    expect(payload.summary.total).toBe(6);
    expect(payload.summary.running).toBe(0);
    expect(payload.summary.throttled).toBe(4);
    expect(payload.summary.finished).toBe(0);
  });

  it("returns 403 when job belongs to another owner", async () => {
    seedVersionOwnership("v-forbidden", "test-owner");
    const postRes = await POST(
      makePost({ versionId: "v-forbidden", paramSpace: { only: [1, 2, 3] } }),
    );
    const { id } = (await postRes.json()) as { id: string };
    const [job] = debugListJobs();
    if (job) {
      job.ownerId = "other-owner";
    }
    const res = await GET(makeGet(id) as any, { params: { id } });
    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("E.FORBIDDEN");
  });

  it("returns 401 when authentication fails", async () => {
    seedVersionOwnership("v-auth", "test-owner");
    await POST(makePost({ versionId: "v-auth", paramSpace: { only: [1] } }));
    delete process.env.E2E_AUTH_BYPASS;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const [job] = debugListJobs();
    const id = job?.id ?? "missing";
    const res = await GET(makeGet(id) as any, { params: { id } });
    expect(res.status).toBe(401);
    const payload = (await res.json()) as any;
    expect(payload.error.code).toBe("E.AUTH");
  });
});
