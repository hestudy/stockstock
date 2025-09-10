# A股量化策略回测终端（SaaS） Product Requirements Document (PRD)

版本：v1.0  
日期：2025-09-10 (UTC+8)  
作者：John（PM）  
关联文档：`docs/project-brief.md`, `docs/brainstorming-session-results.md`

---

## Goals and Background Context

### Goals
- 以最短路径打通“编辑 → 回测 → 查看结果”的单人闭环，2 个月内交付可用 MVP。
- 支持参数网格寻优（并发、早停、重试），验证策略在参数空间下的稳健性。
- 提供可解释的绩效可视化（收益/回撤/夏普、交易列表），加强价值感知与留存。
- 建立最小的策略管理与软计费占位，为商业化验证与治理留出空间。

### Background Context
本项目面向具备一定编程基础的个人量化研究用户。用户的核心动机是以较低成本快速验证交易想法，并在统一的云端环境中完成从策略编辑、回测到结果理解的闭环。MVP 聚焦于日线与 5/15 分钟级别的历史数据，先不涉及实盘交易与 Tick 级数据，优先保证“可用、可看见价值”的路径。技术上通过 Next.js + Supabase + Python 回测服务 + Redis 队列，集中解决作业编排、数据频控与结果展示的一致性问题。

### Change Log
| Date | Version | Description | Author |
| --- | --- | --- | --- |
| 2025-09-10 | v1.0 | 初版 PRD（含 FR/NFR、UI/UX 目标、技术假设、Epics/Stories、Checklist 报告与 Next Steps） | John（PM） |

---

## Requirements

### Functional (FR)
- FR1: 用户可在前端通过代码编辑器与策略模板，提交回测作业，包含策略代码、参数、数据区间、频率等。
- FR2: 系统提供回测作业状态查询接口，支持 queued/running/succeeded/failed/early-stopped。
- FR3: 用户可查看回测结果摘要（净值曲线、交易明细、核心指标），支持结果下载/导出。
- FR4: 参数网格寻优：提交参数空间、查看寻优状态与汇总结果，支持并发、早停、重试。
- FR5: 策略管理最小集：策略注册、元数据、标签、依赖（requirements）声明、基于时间戳的版本标识。
- FR6: 鉴权与账号：基于 Supabase 完成登录/注册与会话管理。
- FR7: 数据获取：对接 Tushare（日线、5/15 分钟），实现频控与缓存。
- FR8: 队列与执行：基于 Redis + Python worker 执行回测/寻优作业；提供重试、超时与早停策略。
- FR9: 前端可视化：使用 ECharts/Recharts 展示收益/回撤/夏普、交易列表、核心图表模板。
- FR10: 历史记录：用户可查看过往回测/寻优作业与结果摘要并复运行。
- FR11: 软计费占位：提供 Free/Pro 与配额规则展示；记录使用量但不触发扣费。
- FR12: 健康检查/可用性检测：提供健康检查接口或 canary 页面。

### Non-Functional (NFR)
- NFR1: 队列性能目标：平均排队 ≤ 30s；在压力下 P95 ≤ 2min。
- NFR2: 首屏性能：结果页概要首屏在 2 秒内完成渲染。
- NFR3: 可观测性：日志、作业状态追踪、错误告警与基础指标采集。
- NFR4: 安全与隔离：用户数据隔离、最小权限访问；研究用途免责声明显著展示。
- NFR5: 可靠性与稳健性：对外部数据源实施频控与缓存；重试/退避策略明确。
- NFR6: 成本效率：在不影响目标的前提下优先利用降低集成复杂度与成本的方案。
- NFR7: 可扩展性：并发寻优任务在单用户场景下具备可扩展能力；为后续多租户演进保留空间。
- NFR8: 可维护性与可移植性：策略依赖声明与沙箱/容器化执行，清晰边界与版本化。

---

## User Interface Design Goals

### Overall UX Vision
- 面向量化研究用户，围绕“编辑→回测→结果”的最短路径，降低上下文切换。
- 提供默认最佳实践：内置策略模板、参数示例、图表布局示例，提升上手速度。
- 保持“专家模式”的信息密度，同时具备渐进式揭示以适应新手学习曲线。

### Key Interaction Paradigms
- 以“提交回测”为中心的状态驱动交互：统一“提交-状态-结果”作业卡体验。
- 多面板布局：左（策略/参数）- 中（状态/结果）- 右（日志/提示）。
- 历史作业列表支持筛选与一键复运行。

### Core Screens and Views
- Login/Register, Strategy Editor, Backtest Submit, Backtest Result, Grid Optimization, Jobs & History, Settings & Quotas, Health/Status。

### Accessibility
- 建议 WCAG AA；代码编辑器深色模式优先。

### Branding
- 金融科技专业风格，高对比度中性色 + 状态强调色；统一图表配色与图例规范。

### Target Device and Platforms
- 建议 Web Responsive（桌面优先，移动端先保证可浏览）。

---

## Technical Assumptions

### Repository Structure
- 建议 Monorepo：`web-frontend(Next.js)`, `api-gateway(可先用 Next.js API routes)`, `backtest-service(Python)`, `workers(Python RQ/Celery)`, `infra`, `shared`。

### Service Architecture
- 建议 Monolith（前端 + 轻 API 层）+ 独立 Python 回测/寻优服务 + Redis 队列；避免过早微服务化。

### Testing Requirements
- 建议 Unit + Integration（关键路径最小 e2e：登录→提交→查看结果首屏）。

### Additional Assumptions
- 前端：Next.js App Router + TypeScript + ECharts/Recharts（择一，偏 ECharts）。
- 回测：Python 3.11+，优先 `vectorbt`，兼容 Backtrader 适配。
- 队列：Redis + RQ（或 Celery），支持重试/超时/早停。
- 存储：Supabase（Auth + Postgres + Storage）；结果大文件走对象存储。
- 数据源：Tushare（日线、5/15 分钟）+ 频控与缓存（边缘/中间层）。
- 可观测性：结构化日志、作业指标（提交/等待/执行/P95/P99）、错误告警。
- 安全/合规：最小权限、用户数据隔离、免责声明显著展示。
- 性能 SLO：排队平均 ≤30s、P95 ≤2min；结果首屏 2s 内。
- 软计费：Free/Pro 占位，使用量记录；配额可视化。

---

## Epic List
- Epic 1: Foundation & Backtest MVP — 完成鉴权、编辑器、提交回测与基础结果，打通可发布闭环。
- Epic 2: Grid Optimization & Queue Orchestration — 参数网格寻优与并发编排、早停、重试。
- Epic 3: Performance Visualization & Result Model — 统一结果模型与高性能可视化。
- Epic 4: Strategy Management Minimal & Soft Billing Placeholder — 策略管理最小集与软计费占位。
- （可选）Epic 5: Observability & Reliability Enhancements — 可观测性与可靠性增强。

---

## Epic Details

### Epic 1: Foundation & Backtest MVP
- 目标：在最短时间内建立“登录 → 策略编辑/模板 → 提交回测 → 查看基础结果”的闭环，并有健康检查。
- Stories
  - Story 1.1 Auth & Health Canary（AC：鉴权可用、健康页可见队列/服务状态、未登录重定向、错误提示）
  - Story 1.2 Strategy Template & Editor（AC：内置模板、语法高亮、依赖声明、元数据可编辑）
  - Story 1.3 Backtest Submit（AC：表单提交、参数校验、返回 jobId、失败可重试/看日志）
  - Story 1.4 Status & Basic Result（AC：状态查询、净值曲线+指标卡、结果导出、首屏 2s）
  - Story 1.5 Minimal Observability（AC：结构化日志、时延指标、错误分类与用户提示）

### Epic 2: Grid Optimization & Queue Orchestration
- 目标：参数空间寻优，拆分子作业，控制并发与早停，最终汇总 Top-N。
- Stories
  - Story 2.1 Opt Grid Submit（AC：参数空间提交、组合上限校验、并发/早停策略）
  - Story 2.2 Queue Orchestration（AC：拆分子作业、并发/排队限制、重试退避、主从聚合）
  - Story 2.3 Workers & Early Stop（AC：消费执行、阈值早停、显式取消、运行指标记录）
  - Story 2.4 Progress & Aggregation（AC：总进度、Top-N 动态榜单、汇总导出与复运行）
  - Story 2.5 Failures & Quotas（AC：失败原因分类、配额提示、频控退避、汇总标注）

### Epic 3: Performance Visualization & Result Model
- 目标：统一结果数据模型，完成指标卡、净值曲线、交易明细与性能优化。
- Stories
  - Story 3.1 Result Model Spec（AC：字段/类型、最小必需集、转换层、示例数据）
  - Story 3.2 Stats & Summary Cards（AC：公式口径、概要卡首屏、缺失回退、Top-N 预留）
  - Story 3.3 Equity Curve Chart（AC：单线曲线、缩放与 tooltip、数据导出、可选基准）
  - Story 3.4 Trades Table（AC：字段、筛选排序、导出、大数据分页/虚拟滚动）
  - Story 3.5 Performance & Caching（AC：分步加载、摘要缓存/抽样、性能指标校验、降级兜底）

### Epic 4: Strategy Management Minimal & Soft Billing Placeholder
- 目标：策略元数据/标签、依赖与时间戳版本、历史与复运行、软计费占位与配额联动。
- Stories
  - Story 4.1 Metadata & Tags（AC：CRUD、检索、与提交联动、权限校验）
  - Story 4.2 Requirements & Versioning（AC：UI 编辑依赖、时间戳版本、版本运行与回滚）
  - Story 4.3 Job History & Re-run（AC：列表与筛选、复运行、摘要导出）
  - Story 4.4 Soft Billing & Usage（AC：Free/Pro 占位、使用量记录、配额状态可视化）
  - Story 4.5 Quota Policies & Enforcement（AC：后端策略、错误码/提示、联动建议、事件记录）

### （可选）Epic 5: Observability & Reliability Enhancements
- 目标：增强日志、监控、告警与缓存/频控，提升稳定性与可运维性。

---

## Checklist Results Report（pm-checklist）

### Executive Summary
- Overall PRD completeness: 90%+（READY/Nearly READY）
- MVP scope appropriateness: Just Right（围绕闭环与价值最短路径）
- Readiness for architecture: READY（已具备架构输入所需的约束与目标）
- Most critical gaps: UI 可达性与深色模式细节、数据口径（复权/时区）与图表库选型最终确认、RQ vs Celery 二选一与部署规范、配额口径细化

### Category Analysis Table
| Category | Status | Critical Issues |
| --- | --- | --- |
| 1. Problem Definition & Context | PASS | 无阻断；用户与成功指标清晰 |
| 2. MVP Scope Definition | PASS | Out-of-Scope 明确；后续增强已标注 |
| 3. User Experience Requirements | PARTIAL | 可达性与移动端范围需明确；导览/新手引导待确认 |
| 4. Functional Requirements | PASS | FR 完整、可测；与 Epics 对齐 |
| 5. Non-Functional Requirements | PASS | 性能/可观测性/安全明确；需持续校准 |
| 6. Epic & Story Structure | PASS | 纵切片清晰；首个可发布闭环明确 |
| 7. Technical Guidance | PARTIAL | 图表库、队列框架、API 层取舍需定稿 |
| 8. Cross-Functional Requirements | PARTIAL | 数据口径与保留策略、监控指标细则需补完 |
| 9. Clarity & Communication | PASS | 文档结构清楚；后续可补图示 |

### Top Issues by Priority
- BLOCKERS: 无
- HIGH: 结果模型口径（复权/时区）；队列框架定稿（RQ vs Celery）；API 层选型（Next.js routes vs 独立网关）
- MEDIUM: 可达性与深色模式范围；移动端覆盖深度；配额指标口径与 UI 提示细则
- LOW: 图示/流程图完善；示例策略库页面是否纳入 MVP

### MVP Scope Assessment
- 可删减项（若需进一步收敛）：基准对比曲线、交易明细高级筛选、历史导出的多格式支持
- 必要补全：结果模型口径细化；并发/配额阈值的默认策略表
- 复杂性关注：参数空间爆炸与资源竞争；Tushare 频控与缓存一致性
- 时间线现实性：按 3 迭代推进具备可行性

### Technical Readiness
- 约束与取舍已明确；风险点清晰；需针对高风险项做打样验证

### Recommendations
- 尽快定稿：图表库、队列框架、API 层方案；补充结果模型与配额默认表
- 增加打样：小规模参数空间寻优与缓存策略回归测试
- 监控先行：作业链路核心指标埋点与告警阈值

### Final Decision
- READY FOR ARCHITECT

---

## Next Steps

### UX Expert Prompt
请基于本 PRD，输出面向“编辑→回测→结果闭环”的高层 IA（信息架构）与关键交互原型建议，优先：
- 代码编辑器与回测提交在同页的布局分区与信息密度取舍。
- 结果页“概要卡（2s 内可见）→曲线→明细”的分步加载策略。
- 历史作业与复运行的最短路径交互。
- 可达性（WCAG AA）与深色模式实践清单。

### Architect Prompt
请基于本 PRD，给出 MVP 的技术架构与接口契约草案，重点：
- Monorepo 模块划分与代码组织（web/api/backtest/workers/infra/shared）。
- Next.js API routes vs 独立 API 网关的取舍建议与迁移路径。
- 回测/寻优作业状态机、错误分类、重试/早停/取消机制与监控指标表。
- 统一结果模型（字段/类型/口径），示例接口（submit/status/result/opt-grid）。
- 频控与缓存策略（Tushare）、配额/并发限制与软计费联动方案。
