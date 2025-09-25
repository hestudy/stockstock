import type { JobStatus } from "./backtest";

export type EarlyStopMode = "min" | "max";

export type EarlyStopPolicy = {
  metric: string;
  threshold: number;
  mode: EarlyStopMode;
};

export type OptimizationSubmitRequest = {
  versionId: string;
  paramSpace: Record<string, unknown>;
  concurrencyLimit?: number;
  earlyStopPolicy?: EarlyStopPolicy;
};

export type OptimizationSubmitResponse = {
  id: string;
  status: JobStatus;
  throttled?: boolean;
};

export type OptimizationTopNEntry = { taskId: string; score: number };

export type OptimizationStopReason = {
  kind: string;
  [key: string]: unknown;
};

export type OptimizationSummary = {
  total: number;
  finished: number;
  running: number;
  throttled: number;
  topN: OptimizationTopNEntry[];
};

export type OptimizationDiagnostics = {
  throttled: boolean;
  queueDepth: number;
  running: number;
  final?: boolean;
  stopReason?: OptimizationStopReason;
};

export type OptimizationStatus = {
  id: string;
  status: JobStatus;
  totalTasks: number;
  concurrencyLimit: number;
  summary: OptimizationSummary;
  diagnostics: OptimizationDiagnostics;
};

export type OptimizationJob = {
  id: string;
  ownerId: string;
  versionId: string;
  paramSpace: Record<string, unknown>;
  concurrencyLimit: number;
  earlyStopPolicy?: EarlyStopPolicy;
  status: JobStatus;
  totalTasks: number;
  summary?: OptimizationSummary;
  createdAt: string;
  updatedAt: string;
};

export type OptimizationTask = {
  id: string;
  jobId: string;
  ownerId: string;
  versionId: string;
  params: Record<string, unknown>;
  status: JobStatus;
  progress?: number;
  retries: number;
  error?: { code: string; message: string };
  resultSummaryId?: string;
  score?: number;
  throttled?: boolean;
  nextRunAt?: string;
  lastError?: { code: string; message: string };
  createdAt: string;
  updatedAt: string;
};
