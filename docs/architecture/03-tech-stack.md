## Tech Stack

以下为基于当前已确认的平台方案（Vercel + Supabase，计算与队列可演进为自托管 Python/Redis）的技术栈初稿。该表为“单一真实来源”，后续开发需遵循此表的版本与约束；如需调整，将在此处更新。

### Technology Stack Table

| Category             | Technology                                 | Version                    | Purpose                       | Rationale                                            |
| -------------------- | ------------------------------------------ | -------------------------- | ----------------------------- | ---------------------------------------------------- |
| Frontend Language    | TypeScript                                 | 5.x                        | 类型安全、契约共享            | 与 Next.js 生态契合，配合 `packages/shared` 统一类型 |
| Frontend Framework   | Next.js (App Router)                       | 14/15 LTS                  | 前端与轻 API 层               | 与 Vercel 原生集成，SSR/ISR/Edge 能力完善            |
| UI Component Library | Tailwind CSS + Headless UI                 | 3.x / 最新                 | 快速构建、可定制              | 金融数据密度高，原子化样式与可达性组件配套           |
| State Management     | Zustand（或 Redux Toolkit）                | 最新                       | 轻量状态与页面间共享          | MVP 优先简单；如需复杂中间件可切换 RTK               |
| Backend Language     | TypeScript + Python                        | TS 5.x / Py 3.11+          | API 层（TS）与回测/寻优（Py） | 契约统一 + 计算灵活                                  |
| Backend Framework    | Next.js API Routes（MVP） + Python FastAPI | Next 14/15 + FastAPI 0.11x | 轻 API 与计算服务接口         | 降低门槛，后续可迁移至 BFF/API Gateway               |
| API Style            | REST                                       | OpenAPI 3                  | 简洁稳定的契约                | 贴合 PRD MVP，“submit/status/result/opt-grid” 明确   |
| Database             | Supabase Postgres                          | 15.x                       | 业务数据、作业/历史           | 托管省运维；与 Auth/Storage 协同                     |
| Cache                | Redis                                      | 7.x                        | 队列、速率限制、部分缓存      | 满足 NFR1 队列时延；支持早停/重试                    |
| File Storage         | Supabase Storage（+ 对象存储可选）         | 最新                       | 结果大文件、导出              | 成本与迭代效率平衡，必要时接对象存储                 |
| Authentication       | Supabase Auth                              | 最新                       | 登录/注册、会话               | 直接与前端集成、可扩展权限                           |
| Frontend Testing     | Vitest + React Testing Library             | 最新                       | 组件与逻辑单测                | 轻量、速度快，贴合 Vite/Next 开发体验                |
| Backend Testing      | Jest（API TS）+ Pytest（Python 服务）      | 最新                       | API/服务层单测                | 双栈分别用主流测试框架                               |
| E2E Testing          | Playwright                                 | 最新                       | 登录 → 提交 → 结果首屏路径    | 覆盖关键闭环与性能断言                               |
| Build Tool           | Turborepo                                  | 最新                       | Monorepo 构建/任务编排        | 多包协同、缓存加速                                   |
| Bundler              | Next.js 默认（Turbopack/Webpack）          | 随 Next                    | 前端打包                      | 使用官方默认，减少自定义成本                         |
| IaC Tool             | Terraform（后续引入）                      | 1.6+                       | 基础设施声明式管理            | MVP 后期逐步落地，支持混合/自托管演进                |
| CI/CD                | GitHub Actions                             | 最新                       | 构建、测试、部署              | 生态成熟，适配 Vercel/Supabase/自托管                |
| Monitoring           | OpenTelemetry + Sentry                     | 最新                       | 追踪/错误上报                 | 统一链路追踪与错误聚合                               |
| Logging              | Pino（TS）+ structlog（Py）                | 最新                       | 结构化日志                    | 满足可观测性与问题定位                               |
| CSS Framework        | Tailwind CSS                               | 3.x                        | 样式与主题                    | 快速一致、暗色模式友好                               |

简要说明

- 前端：Next.js + TS + Tailwind，以“摘要先行 → 曲线 → 明细”的加载策略实现 NFR2 首屏 2s 目标。图表建议 ECharts 5（对金融类图表交互友好，数据量支持好）。
- 后端 API：MVP 用 Next.js API routes；回测/寻优提供 FastAPI 服务以获得更佳的 Python 生态与性能；二者以 REST 契约对齐 `packages/shared` 的类型与接口描述。
- 队列：Redis 7；默认 RQ（上手快），若后续需要复杂编排或分布式任务路由，可无缝切换 Celery（保留观察点）。
- 监控与日志：统一结构化日志，关键作业指标（提交/等待/执行/P95/P99）透传至 OTel，并通过 Sentry 做错误聚合与告警。
- CI/CD：GitHub Actions 对接 Vercel 部署前端与 API，Python 服务与 Redis 可走自托管或托管方案的独立流水线。
