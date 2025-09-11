# Epic Details

## Epic 1: Foundation & Backtest MVP
- 目标：在最短时间内建立“登录 → 策略编辑/模板 → 提交回测 → 查看基础结果”的闭环，并有健康检查。
- Stories
  - Story 1.1 Auth & Health Canary（AC：鉴权可用、健康页可见队列/服务状态、未登录重定向、错误提示）
  - Story 1.2 Strategy Template & Editor（AC：内置模板、语法高亮、依赖声明、元数据可编辑）
  - Story 1.3 Backtest Submit（AC：表单提交、参数校验、返回 jobId、失败可重试/看日志）
  - Story 1.4 Status & Basic Result（AC：状态查询、净值曲线+指标卡、结果导出、首屏 2s）
  - Story 1.5 Minimal Observability（AC：结构化日志、时延指标、错误分类与用户提示）

## Epic 2: Grid Optimization & Queue Orchestration
- 目标：参数空间寻优，拆分子作业，控制并发与早停，最终汇总 Top-N。
- Stories
  - Story 2.1 Opt Grid Submit（AC：参数空间提交、组合上限校验、并发/早停策略）
  - Story 2.2 Queue Orchestration（AC：拆分子作业、并发/排队限制、重试退避、主从聚合）
  - Story 2.3 Workers & Early Stop（AC：消费执行、阈值早停、显式取消、运行指标记录）
  - Story 2.4 Progress & Aggregation（AC：总进度、Top-N 动态榜单、汇总导出与复运行）
  - Story 2.5 Failures & Quotas（AC：失败原因分类、配额提示、频控退避、汇总标注）

## Epic 3: Performance Visualization & Result Model
- 目标：统一结果数据模型，完成指标卡、净值曲线、交易明细与性能优化。
- Stories
  - Story 3.1 Result Model Spec（AC：字段/类型、最小必需集、转换层、示例数据）
  - Story 3.2 Stats & Summary Cards（AC：公式口径、概要卡首屏、缺失回退、Top-N 预留）
  - Story 3.3 Equity Curve Chart（AC：单线曲线、缩放与 tooltip、数据导出、可选基准）
  - Story 3.4 Trades Table（AC：字段、筛选排序、导出、大数据分页/虚拟滚动）
  - Story 3.5 Performance & Caching（AC：分步加载、摘要缓存/抽样、性能指标校验、降级兜底）

## Epic 4: Strategy Management Minimal & Soft Billing Placeholder
- 目标：策略元数据/标签、依赖与时间戳版本、历史与复运行、软计费占位与配额联动。
- Stories
  - Story 4.1 Metadata & Tags（AC：CRUD、检索、与提交联动、权限校验）
  - Story 4.2 Requirements & Versioning（AC：UI 编辑依赖、时间戳版本、版本运行与回滚）
  - Story 4.3 Job History & Re-run（AC：列表与筛选、复运行、摘要导出）
  - Story 4.4 Soft Billing & Usage（AC：Free/Pro 占位、使用量记录、配额状态可视化）
  - Story 4.5 Quota Policies & Enforcement（AC：后端策略、错误码/提示、联动建议、事件记录）

## （可选）Epic 5: Observability & Reliability Enhancements
- 目标：增强日志、监控、告警与缓存/频控，提升稳定性与可运维性。

---
