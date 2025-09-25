import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { POST as submit } from "../route";
import { POST as cancel } from "../[id]/cancel/route";
import { debugListJobs, debugResetJobs } from "../orchestratorClient";
import { resetVersionOwnershipStore, seedVersionOwnership } from "../versionOwnership";

const origEnv = { ...process.env } as Record<string, string | undefined>;

function makeSubmit(body: any) {
  return new Request("http://localhost/api/v1/optimizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeCancel(id: string, body?: any) {
  return new Request(`http://localhost/api/v1/optimizations/${id}/cancel`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : JSON.stringify({}),
  });
}

describe("POST /api/v1/optimizations/:id/cancel", () => {
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

  it("cancels the optimization job and returns final diagnostics", async () => {
    seedVersionOwnership("v-1", "test-owner");
    const submitRes = await submit(
      makeSubmit({ versionId: "v-1", paramSpace: { only: [1, 2, 3] } }),
    );
    const { id } = (await submitRes.json()) as { id: string };

    const cancelRes = await cancel(makeCancel(id, { reason: "manual" }) as any, {
      params: { id },
    });
    expect(cancelRes.status).toBe(202);
    const payload = (await cancelRes.json()) as any;
    expect(payload.status).toBe("canceled");
    expect(payload.diagnostics.final).toBe(true);
    expect(payload.diagnostics.stopReason.kind).toBe("CANCELED");
    expect(payload.diagnostics.stopReason.reason).toBe("manual");

    const [job] = debugListJobs();
    expect(job.status).toBe("canceled");
  });

  it("rejects invalid optimization id", async () => {
    const res = await cancel(makeCancel("bad", { reason: "noop" }) as any, {
      params: { id: "bad" },
    });
    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.error.code).toBe("E.PARAM_INVALID");
  });
});
