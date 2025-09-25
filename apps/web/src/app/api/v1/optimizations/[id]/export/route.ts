import { NextResponse } from "next/server";
import { wrap, fail } from "../../../../_lib/handler";
import { timeHttp } from "../../../../_lib/otel";
import { resolveOwnerId } from "../../owner";
import { exportOptimizationBundle } from "../../orchestratorClient";

const ROUTE = "/api/v1/optimizations/[id]/export";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const jobId = ctx.params?.id;
  return wrap(req, async () =>
    timeHttp(ROUTE, "POST", async () => {
      if (!isValidOptimizationId(jobId)) {
        return fail("E.PARAM_INVALID", "invalid optimization id", { id: jobId }, 400);
      }
      const ownerId = await resolveOwnerId();
      const bundle = await exportOptimizationBundle(ownerId, jobId);
      const body = JSON.stringify(bundle, null, 2);
      const response = new NextResponse(body, {
        status: 200,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "content-disposition": `attachment; filename="${jobId}-topn.json"`,
        },
      });
      return response;
    }, (res) => (res as any)?.status ?? 200),
  );
}

function isValidOptimizationId(id: string | undefined): id is string {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length < 8) {
    return false;
  }
  return /^[a-zA-Z0-9\-]+$/.test(trimmed);
}
