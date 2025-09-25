import { NextResponse } from "next/server";
import { wrap, fail } from "../../../../_lib/handler";
import { timeHttp } from "../../../../_lib/otel";
import { resolveOwnerId } from "../../owner";
import { createOptimizationJob, getOptimizationJobSnapshot } from "../../orchestratorClient";
import { summarizeParamSpace, getParamSpaceLimit } from "../../paramSpace";
import type { EarlyStopPolicy } from "@shared/index";

const ROUTE = "/api/v1/optimizations/[id]/rerun";
const DEFAULT_CONCURRENCY_LIMIT = 2;
const MAX_CONCURRENCY_LIMIT = 16;

export async function POST(req: Request, ctx: { params: { id: string } }) {
  const jobId = ctx.params?.id;
  return wrap(req, async () =>
    timeHttp(ROUTE, "POST", async () => {
      if (!isValidOptimizationId(jobId)) {
        return fail("E.PARAM_INVALID", "invalid optimization id", { id: jobId }, 400);
      }
      const ownerId = await resolveOwnerId();
      const snapshot = await getOptimizationJobSnapshot(ownerId, jobId);
      const overrides = await parseOverrides(req);
      const normalized = summarizeParamSpace(snapshot.paramSpace);
      const limit = getParamSpaceLimit();
      if (normalized.estimate > limit) {
        return fail(
          "E.PARAM_INVALID",
          "param space too large",
          { limit, estimate: normalized.estimate },
          400,
        );
      }
      const concurrencyLimit = resolveConcurrencyLimit(
        overrides?.concurrencyLimit ?? snapshot.concurrencyLimit,
      );
      const earlyStopPolicy = normalizeEarlyStop(
        overrides?.earlyStopPolicy ?? snapshot.earlyStopPolicy,
      );
      const response = await createOptimizationJob({
        ownerId,
        versionId: snapshot.versionId,
        paramSpace: snapshot.paramSpace,
        normalized: normalized.normalized,
        concurrencyLimit,
        earlyStopPolicy,
        estimate: normalized.estimate,
        sourceJobId: jobId,
      });
      const payload = {
        ...response,
        sourceJobId: jobId,
      };
      return NextResponse.json(payload, { status: 202 });
    }, (res) => (res as any)?.status ?? 202),
  );
}

function isValidOptimizationId(id: string | undefined): id is string {
  if (!id || typeof id !== "string") return false;
  const trimmed = id.trim();
  if (trimmed.length < 8) return false;
  return /^[a-zA-Z0-9\-]+$/.test(trimmed);
}

async function parseOverrides(req: Request) {
  try {
    const raw = await req.json();
    if (!raw || typeof raw !== "object") {
      return undefined;
    }
    return raw as {
      concurrencyLimit?: number;
      earlyStopPolicy?: EarlyStopPolicy;
    };
  } catch {
    return undefined;
  }
}

function resolveConcurrencyLimit(value: number | undefined): number {
  if (value === undefined || value === null) {
    return DEFAULT_CONCURRENCY_LIMIT;
  }
  if (!Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error("concurrencyLimit must be a positive integer"), {
      code: "E.PARAM_INVALID",
      status: 400,
    });
  }
  if (value > MAX_CONCURRENCY_LIMIT) {
    return MAX_CONCURRENCY_LIMIT;
  }
  return value;
}

function normalizeEarlyStop(policy: EarlyStopPolicy | undefined): EarlyStopPolicy | undefined {
  if (!policy) {
    return undefined;
  }
  const { metric, threshold, mode } = policy;
  if (typeof metric !== "string" || !metric.trim()) {
    throw Object.assign(new Error("earlyStopPolicy.metric must be a non-empty string"), {
      code: "E.PARAM_INVALID",
      status: 400,
    });
  }
  if (typeof threshold !== "number" || Number.isNaN(threshold)) {
    throw Object.assign(new Error("earlyStopPolicy.threshold must be a number"), {
      code: "E.PARAM_INVALID",
      status: 400,
    });
  }
  if (mode !== "min" && mode !== "max") {
    throw Object.assign(new Error("earlyStopPolicy.mode must be 'min' or 'max'"), {
      code: "E.PARAM_INVALID",
      status: 400,
    });
  }
  return { metric: metric.trim(), threshold, mode };
}
