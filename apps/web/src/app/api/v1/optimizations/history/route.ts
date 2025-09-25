import { NextResponse } from "next/server";
import { wrap, fail } from "../../../_lib/handler";
import { timeHttp } from "../../../_lib/otel";
import { resolveOwnerId } from "../owner";
import { listOptimizationJobs } from "../orchestratorClient";

const ROUTE = "/api/v1/optimizations/history";

export async function GET(req: Request) {
  return wrap(req, async () =>
    timeHttp(ROUTE, "GET", async () => {
      const ownerId = await resolveOwnerId();
      const url = new URL(req.url);
      const rawLimit = url.searchParams.get("limit");
      let limit: number | undefined;
      if (rawLimit !== null) {
        const parsed = Number(rawLimit);
        if (!Number.isFinite(parsed)) {
          return fail("E.PARAM_INVALID", "limit must be a finite number", { limit: rawLimit }, 400);
        }
        limit = parsed;
      }
      const history = await listOptimizationJobs(ownerId, { limit });
      return NextResponse.json(history, { status: 200 });
    }, (response) => (response as any)?.status ?? 200),
  );
}
