import { NextResponse } from "next/server";
import { wrap, fail } from "../../../../_lib/handler";
import { timeHttp } from "../../../../_lib/otel";
import { resolveOwnerId } from "../../owner";
import { cancelOptimizationJob } from "../../orchestratorClient";

const ROUTE = "/api/v1/optimizations/[id]/cancel";

export async function POST(req: Request, ctx: { params: { id: string } }) {
  return wrap(req, async () =>
    timeHttp(ROUTE, "POST", async () => {
      const id = ctx.params?.id;
      if (!isValidOptimizationId(id)) {
        return fail("E.PARAM_INVALID", "invalid optimization id", { id }, 400);
      }

      const ownerId = await resolveOwnerId();
      const reason = await extractReason(req);
      const status = await cancelOptimizationJob(ownerId, id, { reason });
      return NextResponse.json(status, { status: 202 });
    }, (res) => (res as any)?.status ?? 202),
  );
}

async function extractReason(req: Request): Promise<string | undefined> {
  try {
    const body = await req.json();
    if (body && typeof body.reason === "string") {
      const trimmed = body.reason.trim();
      return trimmed.length > 0 ? trimmed : undefined;
    }
  } catch {
    // ignore invalid json; treat as no reason provided
  }
  return undefined;
}

function isValidOptimizationId(id: string | undefined): id is string {
  if (!id) return false;
  if (typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length < 8) return false;
  return /^[a-zA-Z0-9\-]+$/.test(trimmed);
}
