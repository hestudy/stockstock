import type {
  OptimizationJob,
  OptimizationStatus,
  OptimizationSubmitResponse,
  OptimizationSummary,
  OptimizationTask,
} from "@shared/index";
import type { NormalizedParamSpace, ParamSpace } from "./paramSpace";

const STORE_KEY = Symbol.for("opt.jobs.store");
const REQUEST_ID_PREFIX = "optreq";
const SHARED_SECRET_HEADER = "x-opt-shared-secret";
const OWNER_HEADER = "x-owner-id";
const REQUEST_ID_HEADER = "x-request-id";
const MAX_REMOTE_RETRIES = 3;
const REMOTE_RETRY_DELAY_MS = 200;
const MAX_IN_MEMORY_TASKS = 1000;
const TOP_N_LIMIT = 5;

// ==== In-memory store (development & tests) ====
type InMemoryJobState = {
  job: OptimizationJob;
  tasks: OptimizationTask[];
};

type InMemoryStore = {
  jobs: Map<string, InMemoryJobState>;
};

function getStore(): InMemoryStore {
  const globalStore = globalThis as typeof globalThis & { [STORE_KEY]?: InMemoryStore };
  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = { jobs: new Map() };
  }
  return globalStore[STORE_KEY]!;
}

// ==== Public API ====
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

export async function getOptimizationStatus(
  ownerId: string,
  jobId: string,
): Promise<OptimizationStatus> {
  const target = process.env.OPTIMIZATION_ORCHESTRATOR_URL?.trim();
  if (target) {
    return fetchRemoteStatus(target, ownerId, jobId);
  }
  return getInMemoryStatus(ownerId, jobId);
}

// ==== Remote orchestrator helpers ====
async function sendToRemote(
  baseUrl: string,
  input: OptimizationCreateInput,
): Promise<OptimizationSubmitResponse> {
  const url = new URL("/internal/optimizations", baseUrl).toString();
  const sharedSecret = process.env.OPTIMIZATION_ORCHESTRATOR_SECRET?.trim();
  if (!sharedSecret) {
    const err = new Error(
      "OPTIMIZATION_ORCHESTRATOR_SECRET is required when url is configured",
    );
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

async function fetchRemoteStatus(
  baseUrl: string,
  ownerId: string,
  jobId: string,
): Promise<OptimizationStatus> {
  const url = new URL(`/internal/optimizations/${jobId}/status`, baseUrl).toString();
  const sharedSecret = process.env.OPTIMIZATION_ORCHESTRATOR_SECRET?.trim();
  const headers: Record<string, string> = {
    [OWNER_HEADER]: ownerId,
    [REQUEST_ID_HEADER]: generateId(REQUEST_ID_PREFIX),
  };
  if (sharedSecret) {
    headers[SHARED_SECRET_HEADER] = sharedSecret;
  }
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) {
    throw await buildRemoteError(res);
  }
  return (await res.json()) as OptimizationStatus;
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

  const err = new Error(remoteMessage ?? "Failed to interact with orchestrator");
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

// ==== In-memory implementation ====
function createInMemory(input: OptimizationCreateInput): OptimizationSubmitResponse {
  const id = generateId("opt");
  const now = new Date().toISOString();
  const tasks = buildInMemoryTasks(id, input, now);
  const totalTasks = tasks.length;
  const job: OptimizationJob = {
    id,
    ownerId: input.ownerId,
    versionId: input.versionId,
    paramSpace: input.paramSpace,
    concurrencyLimit: input.concurrencyLimit,
    earlyStopPolicy: input.earlyStopPolicy,
    status: "queued",
    totalTasks,
    createdAt: now,
    updatedAt: now,
    summary: initializeSummary(totalTasks, tasks),
  };
  const store = getStore();
  store.jobs.set(id, { job, tasks });
  const throttled = !!(job.summary && job.summary.throttled > 0);
  return { id, status: job.status, throttled };
}

function getInMemoryStatus(ownerId: string, jobId: string): OptimizationStatus {
  const store = getStore();
  const state = store.jobs.get(jobId);
  if (!state) {
    const err = new Error("optimization job not found");
    (err as any).code = "E.NOT_FOUND";
    (err as any).status = 404;
    throw err;
  }
  if (state.job.ownerId !== ownerId) {
    const err = new Error("job does not belong to current owner");
    (err as any).code = "E.FORBIDDEN";
    (err as any).status = 403;
    throw err;
  }
  refreshSummary(state);
  const summary = state.job.summary!;
  return {
    id: state.job.id,
    status: state.job.status,
    totalTasks: state.job.totalTasks,
    concurrencyLimit: state.job.concurrencyLimit,
    summary,
    diagnostics: {
      throttled: summary.throttled > 0,
      queueDepth: summary.throttled,
      running: summary.running,
    },
  };
}

function buildInMemoryTasks(
  jobId: string,
  input: OptimizationCreateInput,
  createdAt: string,
): OptimizationTask[] {
  const combos = expandNormalizedSpace(input.normalized);
  const tasks: OptimizationTask[] = [];
  const limit = Math.min(combos.length, MAX_IN_MEMORY_TASKS);
  for (let i = 0; i < limit; i += 1) {
    const params = combos[i];
    const throttled = i >= input.concurrencyLimit;
    tasks.push({
      id: generateId("opt-task"),
      jobId,
      ownerId: input.ownerId,
      versionId: input.versionId,
      params,
      status: "queued",
      retries: 0,
      createdAt,
      updatedAt: createdAt,
      throttled,
      nextRunAt: createdAt,
    });
  }
  return tasks;
}

function expandNormalizedSpace(normalized: NormalizedParamSpace): Record<string, unknown>[] {
  const entries = Object.entries(normalized ?? {});
  if (entries.length === 0) return [];
  const [firstKey, firstValues] = entries[0];
  let combos = (firstValues as unknown[]).map((value) => ({ [firstKey]: value }));
  for (let i = 1; i < entries.length; i += 1) {
    const [key, values] = entries[i];
    const newCombos: Record<string, unknown>[] = [];
    for (const combo of combos) {
      for (const value of values as unknown[]) {
        newCombos.push({ ...combo, [key]: value });
      }
    }
    combos = newCombos;
    if (combos.length > MAX_IN_MEMORY_TASKS * 2) {
      // prevent explosion; caller will slice later
      break;
    }
  }
  return combos;
}

function initializeSummary(total: number, tasks: OptimizationTask[]): OptimizationSummary {
  const running = tasks.filter((task) => task.status === "running").length;
  const throttled = tasks.filter((task) => task.throttled).length;
  return {
    total,
    finished: 0,
    running,
    throttled,
    topN: [],
  };
}

function refreshSummary(state: InMemoryJobState) {
  const { tasks, job } = state;
  const finished = tasks.filter((task) =>
    task.status === "succeeded" ||
    task.status === "failed" ||
    task.status === "early-stopped" ||
    task.status === "canceled",
  ).length;
  const running = tasks.filter((task) => task.status === "running").length;
  const throttled = tasks.filter((task) => task.throttled).length;
  const mode =
    typeof job.earlyStopPolicy?.mode === "string" &&
    job.earlyStopPolicy.mode.toLowerCase() === "min"
      ? "min"
      : "max";
  const topCandidates = tasks
    .filter((task) => typeof task.score === "number")
    .sort((a, b) => {
      const aScore = a.score as number;
      const bScore = b.score as number;
      return mode === "min" ? aScore - bScore : bScore - aScore;
    })
    .slice(0, TOP_N_LIMIT)
    .map((task) => ({ taskId: task.id, score: task.score as number }));
  job.summary = {
    total: job.totalTasks,
    finished,
    running,
    throttled,
    topN: topCandidates,
  };
  job.updatedAt = new Date().toISOString();
  if (running > 0) {
    job.status = "running";
  } else if (finished >= job.totalTasks) {
    job.status = "succeeded";
  }
}

// ==== Debug helpers for tests ====
export function debugListJobs(): OptimizationJob[] {
  const store = getStore();
  return Array.from(store.jobs.values()).map((state) => state.job);
}

export function debugListTasks(jobId: string): OptimizationTask[] {
  const store = getStore();
  const state = store.jobs.get(jobId);
  return state ? [...state.tasks] : [];
}

export function debugResetJobs() {
  const store = getStore();
  store.jobs.clear();
}

// ==== Utilities ====
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
