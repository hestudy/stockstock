import type { OptimizationJob, OptimizationSubmitResponse } from "@shared/index";
import type { NormalizedParamSpace, ParamSpace } from "./paramSpace";

const STORE_KEY = Symbol.for("opt.jobs.store");

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
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
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
    const err = new Error("Failed to enqueue optimization job");
    (err as any).code = "E.DEP_UPSTREAM";
    (err as any).status = res.status >= 400 && res.status < 500 ? res.status : 502;
    try {
      const payload = await res.json();
      (err as any).details = payload;
    } catch {
      // ignore
    }
    throw err;
  }
  const data = (await res.json()) as OptimizationSubmitResponse;
  return data;
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
