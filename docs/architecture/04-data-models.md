## Data Models

基于 PRD 的 FR/NFR 与 Epics，定义 MVP 的核心概念模型并给出共享 TS 接口（用于 `packages/shared/types/`）。数据库落地将在后续“Database Schema”章节实现。

### 核心模型列表

- Strategy（策略）
- StrategyVersion（策略版本）
- BacktestJob（回测作业）
- OptimizationJob（寻优父作业）
- OptimizationTask（寻优子作业）
- ResultSummary（结果摘要）
- Trade（交易明细）
- QuotaUsage（配额/软计费）
- HealthStatus（健康/可用性）

### Strategy

Purpose：策略元数据/标签，与提交回测联动。

```ts
export interface Strategy {
  id: string;
  ownerId: string;
  name: string;
  tags: string[];
  createdAt: string; // ISO
  updatedAt: string; // ISO
  latestVersionId?: string;
}
```

### StrategyVersion

Purpose：固化代码与依赖的时间戳版本。

```ts
export interface StrategyVersion {
  id: string;
  strategyId: string;
  code: string; // or storage ref
  requirements: string[];
  metadata?: Record<string, any>;
  createdAt: string;
}
```

### BacktestJob

Purpose：单次回测作业，统一状态机与错误对象。

```ts
export interface BacktestJob {
  id: string;
  ownerId: string;
  versionId: string;
  params: Record<string, any>;
  status:
    | "queued"
    | "running"
    | "succeeded"
    | "failed"
    | "early-stopped"
    | "canceled";
  progress?: number; // 0..1
  retries: number;
  error?: { code: string; message: string };
  resultSummaryId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### OptimizationJob（父）

Purpose：参数空间寻优的聚合与编排实体。

```ts
export interface OptimizationJob {
  id: string;
  ownerId: string;
  versionId: string;
  paramSpace: Record<string, any>;
  concurrencyLimit: number;
  earlyStopPolicy?: { metric: string; threshold: number; mode: "min" | "max" };
  status: BacktestJob["status"];
  summary?: {
    total: number;
    finished: number;
    topN: Array<{ taskId: string; score: number }>;
  };
  createdAt: string;
  updatedAt: string;
}
```

### OptimizationTask（子）

Purpose：具体参数组合的回测任务，与 BacktestJob 接近。

```ts
export interface OptimizationTask {
  id: string;
  jobId: string; // parent
  ownerId: string;
  versionId: string;
  params: Record<string, any>;
  status: BacktestJob["status"];
  progress?: number;
  retries: number;
  error?: { code: string; message: string };
  resultSummaryId?: string;
  score?: number; // e.g., sharpe
  createdAt: string;
  updatedAt: string;
}
```

### ResultSummary

Purpose：支撑“2 秒首屏”的摘要，曲线/明细走延迟加载或外部存储引用。

```ts
export interface ResultSummary {
  id: string;
  ownerId: string;
  metrics: { [k: string]: number | undefined }; // sharpe/return/mdd...
  equityCurveRef?: string; // storage/table ref
  tradesRef?: string; // storage/table ref
  artifacts?: Array<{ type: string; url: string }>;
  createdAt: string;
}
```

### Trade

Purpose：交易明细，支持筛选/导出/大数据分页。

```ts
export interface Trade {
  id: string;
  resultId: string;
  ts: string;
  symbol: string;
  side: "buy" | "sell";
  qty: number;
  price: number;
  fee?: number;
  pnl?: number;
  meta?: Record<string, any>;
}
```

### QuotaUsage（软计费）

Purpose：记录使用量并与 Free/Pro 配额展示联动。

```ts
export interface QuotaUsage {
  id: string;
  ownerId: string;
  scope: "backtest" | "optimize" | "storage" | "api";
  amount: number;
  period: "day" | "month";
  updatedAt: string;
}
```

### HealthStatus

Purpose：健康/可用性快照。

```ts
export interface HealthStatus {
  service: "api" | "worker" | "queue" | "datasource";
  status: "up" | "degraded" | "down";
  details?: Record<string, any>;
  ts: string;
}
```

关系概览：

- Strategy 1—N StrategyVersion
- StrategyVersion 1—N BacktestJob，1—N OptimizationTask
- OptimizationJob 1—N OptimizationTask
- BacktestJob/OptimizationTask 1—1 ResultSummary；ResultSummary 1—N Trade（或经 Ref 指向外部存储）
