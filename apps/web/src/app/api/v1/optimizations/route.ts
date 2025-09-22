import { NextResponse } from "next/server";
import type {
  EarlyStopPolicy,
  OptimizationSubmitRequest,
  OptimizationSubmitResponse,
} from "@shared/index";
import { getOwner } from "../../_lib/auth";
import { fail, wrap } from "../../_lib/handler";
import { timeHttp } from "../../_lib/otel";
import { createOptimizationJob } from "./orchestratorClient";
import { getParamSpaceLimit, summarizeParamSpace } from "./paramSpace";

const ROUTE = "/api/v1/optimizations";
const DEFAULT_CONCURRENCY_LIMIT = 2;
const MAX_CONCURRENCY_LIMIT = 16;

export async function POST(req: Request) {
  return wrap(req, async () =>
    timeHttp(ROUTE, "POST", async () => {
      const ownerId = await resolveOwner();
      const body = await parseJson(req);
      const normalized = summarizeParamSpace(body.paramSpace);
      const limit = getParamSpaceLimit();
      if (normalized.estimate > limit) {
        return fail(
          "E.PARAM_INVALID",
          "param space too large",
          { limit, estimate: normalized.estimate },
        );
      }

      const concurrencyLimit = resolveConcurrencyLimit(body.concurrencyLimit);
      const earlyStopPolicy = validateEarlyStop(body.earlyStopPolicy);

      const response = await createOptimizationJob({
        ownerId,
        versionId: body.versionId,
        paramSpace: body.paramSpace,
        normalized: normalized.normalized,
        concurrencyLimit,
        earlyStopPolicy,
        estimate: normalized.estimate,
      });
      const payload: OptimizationSubmitResponse = {
        id: response.id,
        status: response.status,
      };
      const res = NextResponse.json(payload, { status: 202 });
      res.headers.set("x-param-space-estimate", String(normalized.estimate));
      res.headers.set("x-concurrency-limit", String(concurrencyLimit));
      return res;
    }, (res) => (res as Response).status ?? 202),
  );
}

async function resolveOwner(): Promise<string> {
  if (process.env.E2E_AUTH_BYPASS === "1") {
    return "test-owner";
  }
  try {
    const owner = await getOwner();
    return owner.ownerId;
  } catch (err: any) {
    const error = new Error("authentication required");
    (error as any).code = "E.AUTH";
    (error as any).status = 401;
    throw error;
  }
}

async function parseJson(req: Request): Promise<OptimizationSubmitRequest> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    const error = new Error("invalid JSON body");
    (error as any).code = "E.PARAM_INVALID";
    (error as any).status = 400;
    throw error;
  }
  if (!raw || typeof raw !== "object") {
    const error = new Error("request body must be an object");
    (error as any).code = "E.PARAM_INVALID";
    (error as any).status = 400;
    throw error;
  }
  const body = raw as OptimizationSubmitRequest;
  if (typeof body.versionId !== "string" || !body.versionId.trim()) {
    const error = new Error("versionId is required");
    (error as any).code = "E.PARAM_INVALID";
    (error as any).status = 400;
    throw error;
  }
  if (!body.paramSpace || typeof body.paramSpace !== "object") {
    const error = new Error("paramSpace is required");
    (error as any).code = "E.PARAM_INVALID";
    (error as any).status = 400;
    throw error;
  }
  return body;
}

function resolveConcurrencyLimit(input: OptimizationSubmitRequest["concurrencyLimit"]): number {
  if (input === undefined || input === null) {
    return DEFAULT_CONCURRENCY_LIMIT;
  }
  if (!Number.isInteger(input) || input <= 0) {
    throwParamInvalid("concurrencyLimit must be a positive integer");
  }
  if (input > MAX_CONCURRENCY_LIMIT) {
    return MAX_CONCURRENCY_LIMIT;
  }
  return input;
}

function validateEarlyStop(policy: OptimizationSubmitRequest["earlyStopPolicy"]): EarlyStopPolicy | undefined {
  if (policy == null) return undefined;
  const { metric, threshold, mode } = policy as EarlyStopPolicy;
  if (typeof metric !== "string" || !metric.trim()) {
    throwParamInvalid("earlyStopPolicy.metric must be a non-empty string");
  }
  if (typeof threshold !== "number" || Number.isNaN(threshold)) {
    throwParamInvalid("earlyStopPolicy.threshold must be a number");
  }
  if (mode !== "min" && mode !== "max") {
    throwParamInvalid("earlyStopPolicy.mode must be 'min' or 'max'");
  }
  return { metric: metric.trim(), threshold, mode };
}

function throwParamInvalid(message: string, details?: Record<string, unknown>): never {
  const err = new Error(message);
  (err as any).code = "E.PARAM_INVALID";
  (err as any).status = 400;
  if (details) {
    (err as any).details = details;
  }
  throw err;
}
