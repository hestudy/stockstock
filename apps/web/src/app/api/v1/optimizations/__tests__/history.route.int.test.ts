import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST } from "../route";
import { GET } from "../history/route";
import { debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makePost(body: any) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeHistory(limit?: number) {
  const base = "http://localhost/api/v1/optimizations/history";
  const url = limit ? `${base}?limit=${limit}` : base;
  return new Request(url, { method: "GET" });
}

describe("GET /api/v1/optimizations/history", () => {
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

  it("returns recent jobs ordered by updated time", async () => {
    seedVersionOwnership("v-history", "test-owner");
    const firstRes = await POST(
      makePost({ versionId: "v-history", paramSpace: { only: [1, 2] }, concurrencyLimit: 1 }),
    );
    expect(firstRes.status).toBe(202);
    const first = (await firstRes.json()) as { id: string };

    const secondRes = await POST(
      makePost({
        versionId: "v-history",
        paramSpace: { only: [3] },
        concurrencyLimit: 1,
        sourceJobId: first.id,
      }),
    );
    expect(secondRes.status).toBe(202);
    const second = (await secondRes.json()) as { id: string };

    const store = (globalThis as any)[Symbol.for("opt.jobs.store")] as
      | { jobs: Map<string, { job: any }> }
      | undefined;
    const secondState = store?.jobs.get(second.id);
    if (secondState) {
      secondState.job.updatedAt = "2030-01-01T00:00:00.000Z";
      secondState.job.summary = {
        total: 6,
        finished: 3,
        running: 0,
        throttled: 0,
        topN: [],
      };
    }
    const firstState = store?.jobs.get(first.id);
    if (firstState) {
      firstState.job.updatedAt = "1970-01-01T00:00:00.000Z";
    }

    const response = await GET(makeHistory(2));
    expect(response.status).toBe(200);
    const history = (await response.json()) as Array<{ id: string; updatedAt: string }>;
    expect(history).toHaveLength(2);
    expect(history.some((entry) => entry.id === second.id)).toBe(true);
    const timestamps = history.map((entry) => Date.parse(entry.updatedAt));
    const sorted = [...timestamps].sort((a, b) => b - a);
    expect(timestamps).toEqual(sorted);
  });

  it("rejects non-numeric limit", async () => {
    seedVersionOwnership("v-history", "test-owner");
    await POST(makePost({ versionId: "v-history", paramSpace: { only: [1] } }));
    const response = await GET(new Request("http://localhost/api/v1/optimizations/history?limit=abc"));
    expect(response.status).toBe(400);
    const payload = (await response.json()) as any;
    expect(payload.error.code).toBe("E.PARAM_INVALID");
  });
});
