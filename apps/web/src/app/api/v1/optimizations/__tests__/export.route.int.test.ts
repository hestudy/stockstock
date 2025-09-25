import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { POST as createOptimization } from "../route";
import { POST as exportRoute } from "../[id]/export/route";
import { debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makePost(body: unknown) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeExport(id: string) {
  return new Request(`http://localhost/api/v1/optimizations/${id}/export`, {
    method: "POST",
  });
}

describe("POST /api/v1/optimizations/:id/export", () => {
  beforeEach(() => {
    process.env = {
      ...origEnv,
      NODE_ENV: "test",
      OBS_ENABLED: "false",
      E2E_AUTH_BYPASS: "1",
      OPT_PARAM_SPACE_MAX: "64",
      OPT_TOP_N_LIMIT: "3",
    } as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  afterEach(() => {
    process.env = origEnv as any;
    debugResetJobs();
    resetVersionOwnershipStore();
  });

  it("returns downloadable bundle with Top-N artifacts", async () => {
    seedVersionOwnership("v-export", "test-owner");
    const createRes = await createOptimization(
      makePost({
        versionId: "v-export",
        paramSpace: {
          alpha: [0.1, 0.2, 0.3],
          beta: [1, 2],
        },
        concurrencyLimit: 2,
      }),
    );
    expect(createRes.status).toBe(202);
    const { id } = (await createRes.json()) as { id: string };

    const store = (globalThis as any)[Symbol.for("opt.jobs.store")] as
      | { jobs: Map<string, { job: any; tasks: any[] }> }
      | undefined;
    const state = store?.jobs.get(id);
    expect(state).toBeTruthy();
    const tasks = state!.tasks as any[];
    tasks.slice(0, 3).forEach((task, index) => {
      task.status = "succeeded";
      task.score = 1.5 - index * 0.2;
      task.resultSummaryId = `summary-${index + 1}`;
    });

    const exportRes = await exportRoute(makeExport(id), { params: { id } });
    expect(exportRes.status).toBe(200);
    const disposition = exportRes.headers.get("content-disposition");
    expect(disposition).toContain(`${id}-topn.json`);
    const bundle = (await exportRes.json()) as any;
    expect(bundle.jobId).toBe(id);
    expect(bundle.summary.finished).toBe(3);
    expect(Array.isArray(bundle.items)).toBe(true);
    expect(bundle.items.length).toBeGreaterThan(0);
    const first = bundle.items[0];
    expect(first).toMatchObject({
      taskId: tasks[0].id,
      resultSummaryId: "summary-1",
    });
    expect(first.metrics?.score).toBeCloseTo(1.5, 5);
    expect(first.artifacts?.[0]?.type).toBe("metrics");
  });
});
