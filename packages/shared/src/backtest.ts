export type JobStatus = "queued" | "running" | "succeeded" | "failed";

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
};

export type ResultSummary = {
  id: string;
  metrics: Record<string, number>;
  preview?: string;
};
