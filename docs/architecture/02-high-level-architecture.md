## High Level Architecture

### Technical Summary

- 采用「Monolith + 独立计算服务」：前端与轻 API 层由 Next.js（App Router + TypeScript）承载；回测/寻优由独立 Python 服务与 Redis 队列负责。此形态在 MVP 阶段可显著降低复杂度，同时确保关键 FR（作业提交/状态/结果）与 NFR（队列时延、首屏性能）的达成。
- 前端通过 Supabase Auth 完成登录/注册与会话管理。Next.js API Routes 暂时代替独立 API 网关；为后续演进保留迁移路径（API Gateway/BFF）。
- 数据与文件存储优先使用 Supabase Postgres/Storage；回测结果的大文件通过对象存储管理；历史记录与作业状态统一建模以支持复运行与导出。
- 队列使用 Redis（RQ 或 Celery 二选一，默认 RQ 作为 MVP 选项），支持重试、超时与早停；结合结构化日志与指标埋点满足可观测性需求。
- 外部数据源 Tushare 通过中间层频控与缓存；在结果页采用“摘要先行（2s 首屏）→ 曲线 → 明细”的渐进式加载策略达成体验目标。
- 平台上建议 Vercel + Supabase 快速起步，可按需演进为混合部署（自托管 Python/Redis）。

### Platform and Infrastructure Choice（结论）

- 推荐：Vercel + Supabase（MVP），可演进为混合（自托管 Python/Redis 同区或近区）。
- 区域：Vercel Global Edge + Supabase AP-Southeast-1（建议）。
- 服务：Next.js Hosting、Supabase Auth/Postgres/Storage、Redis、Python Workers。

### Repository Structure（建议）

- Monorepo（Turborepo 或 npm workspaces + turbo）。
- apps/web、apps/api（可与 web 合并为 Next.js routes）、services/backtest（Python）、services/workers（Python）、packages/shared、infra。

### High Level Architecture Diagram

```mermaid
graph TD
  U[User (Browser)] --> FE[Next.js App (Vercel)]
  FE -->|Auth| SUPA_AUTH[Supabase Auth]
  FE -->|API Calls| API[Next.js API Routes (Vercel)]
  API --> DB[(Supabase Postgres)]
  API --> STORE[(Supabase Storage)]
  API --> QUEUE[(Redis)]
  API -->|Submit Jobs| ENQ[(Enqueue Job)]
  QUEUE --> WRK[Python Workers (Backtest/Opt)]
  WRK --> DS[Tushare Data Layer]
  WRK --> RES[(Result Artifacts/Object Storage)]
  WRK --> DB
  FE -->|Results (summary->chart->details)| API
  subgraph External
    DS[Tushare API]
  end
  subgraph Compute
    QUEUE
    WRK
  end
```

### Architectural Patterns

- Jamstack/Serverless Monolith + Independent Compute（MVP 简化复杂度，计算/队列独立）
- Component-Based UI + Typed Service Layer（`packages/shared` 统一类型与契约）
- Repository Pattern（后端数据访问抽象）
- BFF（演进方向，必要时引入 API Gateway）
- Structured Logging + Observability Baseline（覆盖作业/队列/数据层指标与告警）
