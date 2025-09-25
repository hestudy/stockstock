import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { POST as createOptimization } from "../route";
import { POST as rerunRoute } from "../[id]/rerun/route";
import { debugListJobs, debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makeCreate(body: unknown) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeRerun(id: string, overrides?: unknown) {
  return new Request(`http://localhost/api/v1/optimizations/${id}/rerun`, {
    method: "POST",
    headers: overrides ? { "content-type": "application/json" } : undefined,
    body: overrides ? JSON.stringify(overrides) : undefined,
  });
}

describe("POST /api/v1/optimizations/:id/rerun", () => {
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: "test",
      OBS_ENABLED: "false",
      E2E_AUTH_BYPASS: "1",
      OPT_PARAM_SPACE_MAX: "64",
      OPT_CONCURRENCY_LIMIT_MAX: "8",
    } as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  afterEach(() => {
    process.env = origEnv as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  it("clones param space and marks source job id", async () => {
    seedVersionOwnership("v-rerun", "test-owner");
    const createRes = await createOptimization(
      makeCreate({
        versionId: "v-rerun",
        paramSpace: { a: [1, 2], b: [3, 4] },
        concurrencyLimit: 2,
      }),
    );
    expect(createRes.status).toBe(202);
    const { id: originalId } = (await createRes.json()) as { id: string };

    const rerunRes = await rerunRoute(makeRerun(originalId, { concurrencyLimit: 4 }), {
      params: { id: originalId },
    });
    expect(rerunRes.status).toBe(202);
    const body = (await rerunRes.json()) as any;
    expect(body.id).not.toBe(originalId);
    expect(body.sourceJobId).toBe(originalId);

    const jobs = debugListJobs();
    const clone = jobs.find((job) => job.id === body.id);
    const original = jobs.find((job) => job.id === originalId);
    expect(clone).toBeTruthy();
    expect(original).toBeTruthy();
    expect(clone?.paramSpace).toEqual(original?.paramSpace);
    expect(clone?.earlyStopPolicy).toEqual(original?.earlyStopPolicy);
    expect(clone?.concurrencyLimit).toBeLessThanOrEqual(4);
    expect(clone?.sourceJobId).toBe(originalId);
  });
});
