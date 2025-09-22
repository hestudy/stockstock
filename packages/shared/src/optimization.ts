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
};

export type OptimizationSummary = {
  total: number;
  finished: number;
  topN: Array<{ taskId: string; score: number }>;
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
  createdAt: string;
  updatedAt: string;
};
