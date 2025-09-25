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

export type ResultArtifact = {
  type: string;
  url: string;
};

export type ResultSummary = {
  id: string;
  ownerId: string;
  metrics: Record<string, number | undefined>;
  preview?: string;
  equity?: EquityPoint[];
  equityCurveRef?: string;
  tradesRef?: string;
  artifacts?: ResultArtifact[];
  createdAt: string;
};

export type EquityPoint = { t: number; v: number };

export type ExportPayload = {
  id: string;
  metrics: Record<string, number>;
  equity?: EquityPoint[];
};
