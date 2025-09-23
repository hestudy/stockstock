import { NextResponse } from "next/server";
import { wrap, fail } from "../../../../_lib/handler";
import { timeHttp } from "../../../../_lib/otel";
import { rateLimit } from "../../../../_lib/rateLimit";
import { resolveOwnerId } from "../../owner";
import { getOptimizationStatus } from "../../orchestratorClient";

const ROUTE = "/api/v1/optimizations/[id]/status";
const RATE_LIMIT = { limit: 90, windowMs: 60_000 } as const;

export async function GET(req: Request, ctx: { params: { id: string } }) {
  return wrap(req, async () =>
    timeHttp(ROUTE, "GET", async () => {
      const id = ctx.params?.id;
      if (!isValidOptimizationId(id)) {
        return fail("E.PARAM_INVALID", "invalid optimization id", { id }, 400);
      }

      const ownerId = await resolveOwnerId();
      const path = new URL(req.url).pathname;
      const rlKey = `${ownerId}:${path}:GET`;
      const rl = rateLimit(rlKey, RATE_LIMIT);
      if (!rl.allowed) {
        return fail(
          "E.RATE_LIMITED",
          "request rate limited",
          { resetAt: new Date(rl.resetAt).toISOString() },
          429,
        );
      }

      const status = await getOptimizationStatus(ownerId, id);
      return NextResponse.json(status, { status: 200 });
    }, (res) => (res as any)?.status ?? 200),
  );
}

function isValidOptimizationId(id: string | undefined): id is string {
  if (!id) return false;
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length < 8) return false;
  return /^[a-zA-Z0-9\-]+$/.test(trimmed);
}
