import type { OptimizationJob, OptimizationSubmitResponse } from "@shared/index";
import type { NormalizedParamSpace, ParamSpace } from "./paramSpace";

const STORE_KEY = Symbol.for("opt.jobs.store");
const REQUEST_ID_PREFIX = "optreq";
const SHARED_SECRET_HEADER = "x-opt-shared-secret";
const OWNER_HEADER = "x-owner-id";
const REQUEST_ID_HEADER = "x-request-id";
const MAX_REMOTE_RETRIES = 3;
const REMOTE_RETRY_DELAY_MS = 200;

type InMemoryStore = {
  jobs: Map<string, OptimizationJob>;
};

function getStore(): InMemoryStore {
  const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: InMemoryStore };
  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = { jobs: new Map() };
  }
  return globalStore[STORE_KEY]!;
}

export type OptimizationCreateInput = {
  ownerId: string;
  versionId: string;
  paramSpace: ParamSpace;
  normalized: NormalizedParamSpace;
  concurrencyLimit: number;
  earlyStopPolicy?: OptimizationJob["earlyStopPolicy"];
  estimate: number;
};

export async function createOptimizationJob(
  input: OptimizationCreateInput,
): Promise<OptimizationSubmitResponse> {
  const target = process.env.OPTIMIZATION_ORCHESTRATOR_URL?.trim();
  if (target) {
    return sendToRemote(target, input);
  }
  return createInMemory(input);
}

async function sendToRemote(
  baseUrl: string,
  input: OptimizationCreateInput,
): Promise<OptimizationSubmitResponse> {
  const url = new URL("/internal/optimizations", baseUrl).toString();
  const sharedSecret = process.env.OPTIMIZATION_ORCHESTRATOR_SECRET?.trim();
  if (!sharedSecret) {
    const err = new Error("OPTIMIZATION_ORCHESTRATOR_SECRET is required when url is configured");
    (err as any).code = "E.CONFIG";
    (err as any).status = 500;
    throw err;
  }
  let attempt = 0;
  let lastError: unknown;
  const requestId = generateId(REQUEST_ID_PREFIX);
  while (attempt < MAX_REMOTE_RETRIES) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [SHARED_SECRET_HEADER]: sharedSecret,
          [OWNER_HEADER]: input.ownerId,
          [REQUEST_ID_HEADER]: requestId,
        },
        body: JSON.stringify({
          ownerId: input.ownerId,
          versionId: input.versionId,
          paramSpace: input.paramSpace,
          normalizedParamSpace: input.normalized,
          concurrencyLimit: input.concurrencyLimit,
          earlyStopPolicy: input.earlyStopPolicy,
          estimate: input.estimate,
        }),
      });
      if (!res.ok) {
        const error = await buildRemoteError(res);
        if (res.status >= 500 && attempt < MAX_REMOTE_RETRIES) {
          lastError = error;
          await delay(Math.pow(2, attempt - 1) * REMOTE_RETRY_DELAY_MS);
          continue;
        }
        throw error;
      }
      const data = (await res.json()) as OptimizationSubmitResponse;
      return data;
    } catch (err) {
      lastError = err;
      const isNetwork = err instanceof TypeError || (err as any)?.code === "ECONNREFUSED";
      if (!isNetwork || attempt >= MAX_REMOTE_RETRIES) {
        throw err;
      }
      await delay(Math.pow(2, attempt - 1) * REMOTE_RETRY_DELAY_MS);
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Failed to contact orchestrator");
}

async function buildRemoteError(res: Response) {
  let payload: unknown;
  try {
    payload = await res.json();
  } catch {
    payload = undefined;
  }

  const detail = (payload as any)?.detail ?? payload;
  const remoteCode = typeof detail?.code === "string" ? detail.code : undefined;
  const remoteMessage = typeof detail?.message === "string" ? detail.message : undefined;

  const err = new Error(remoteMessage ?? "Failed to enqueue optimization job");
  const fallbackCode = res.status === 401 || res.status === 403 ? "E.FORBIDDEN" : "E.DEP_UPSTREAM";

  (err as any).code = remoteCode ?? fallbackCode;
  (err as any).status = res.status >= 400 && res.status < 600 ? res.status : 502;

  const details = typeof detail?.details === "object" && detail?.details != null ? detail.details : detail;
  if (details) {
    (err as any).details = details;
  }

  const requestId = typeof detail?.requestId === "string" ? detail.requestId : undefined;
  if (requestId) {
    (err as any).requestId = requestId;
  }

  return err;
}

function createInMemory(input: OptimizationCreateInput): OptimizationSubmitResponse {
  const id = generateId("opt");
  const now = new Date().toISOString();
  const job: OptimizationJob = {
    id,
    ownerId: input.ownerId,
    versionId: input.versionId,
    paramSpace: input.paramSpace,
    concurrencyLimit: input.concurrencyLimit,
    earlyStopPolicy: input.earlyStopPolicy,
    status: "queued",
    totalTasks: input.estimate,
    createdAt: now,
    updatedAt: now,
  };
  const store = getStore();
  store.jobs.set(id, job);
  return { id, status: job.status };
}

export function debugListJobs(): OptimizationJob[] {
  const store = getStore();
  return Array.from(store.jobs.values());
}

export function debugResetJobs() {
  const store = getStore();
  store.jobs.clear();
}

function generateId(prefix: string): string {
  const g: any = globalThis as any;
  const randomUUID = g?.crypto?.randomUUID?.bind(g.crypto);
  if (typeof randomUUID === "function") {
    return randomUUID();
  }
  const random = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${random}`;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
