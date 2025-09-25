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
  sourceJobId?: string;
};

export type OptimizationTopNEntry = {
  taskId: string;
  score: number;
  resultSummaryId?: string;
};

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
  earlyStopPolicy?: EarlyStopPolicy;
  sourceJobId?: string;
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
  sourceJobId?: string;
};

export type OptimizationJobSnapshot = {
  id: string;
  ownerId: string;
  versionId: string;
  paramSpace: Record<string, unknown>;
  concurrencyLimit: number;
  earlyStopPolicy?: EarlyStopPolicy;
  status: JobStatus;
  totalTasks: number;
  summary: OptimizationSummary;
  createdAt: string;
  updatedAt: string;
  sourceJobId?: string;
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

export type OptimizationExportItem = {
  taskId: string;
  score: number | null;
  params: Record<string, unknown>;
  resultSummaryId?: string;
  metrics?: Record<string, number | undefined>;
  artifacts?: Array<{ type: string; url: string }>;
};

export type OptimizationExportBundle = {
  jobId: string;
  status: JobStatus;
  generatedAt: string;
  summary: OptimizationSummary;
  items: OptimizationExportItem[];
};
