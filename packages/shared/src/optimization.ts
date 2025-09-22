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

export type OptimizationJob = {
  id: string;
  ownerId: string;
  versionId: string;
  paramSpace: Record<string, unknown>;
  concurrencyLimit: number;
  earlyStopPolicy?: EarlyStopPolicy;
  status: JobStatus;
  totalTasks: number;
  createdAt: string;
  updatedAt: string;
};
