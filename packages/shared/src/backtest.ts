export type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "early-stopped"
  | "canceled";

export type BacktestSubmitRequest = {
  versionId: string;
  params: Record<string, any>;
  clientRequestId?: string; // 前端生成的幂等键
};

export type BacktestSubmitResponse = {
  id: string;
  status: JobStatus;
};

export type BacktestStatusResponse = {
  id: string;
  status: JobStatus;
  startedAt?: string;
  finishedAt?: string;
  progress?: number; // 0-100
  retries?: number;
};

export type ResultSummary = {
  id: string;
  metrics: Record<string, number>;
  preview?: string;
  equity?: EquityPoint[];
};

export type EquityPoint = { t: number; v: number };

export type ExportPayload = {
  id: string;
  metrics: Record<string, number>;
  equity?: EquityPoint[];
};
