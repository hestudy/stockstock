# 项目简报（Project Brief）— A股量化策略回测终端（SaaS）

**版本：** v1.0  
**日期：** 2025-09-10 (UTC+8)  
**编写：** Business Analyst Mary  
**关联文档：** `docs/brainstorming-session-results.md`

---

## 1. 项目概述（Overview）
- 目标：为个人量化交易者提供一体化的策略研究与回测云端SaaS，帮助其快速完成“编辑-回测-查看结果”的核心闭环。
- 定位：MVP 面向单用户个人版，后续演进多租户/团队协作。
- 时间范围：2 个月 MVP（含三大能力块与基础鉴权/策略管理最小集）。

## 2. 目标用户（Target Users）
- 主要用户：具有一定编程基础的个人量化交易者/策略研究者。
- 用户动机：
  - 快速验证策略想法与参数组合。
  - 用较低成本获得相对完善的回测与指标展示能力。
  - 具备一定可扩展性（依赖声明、版本化、模板化）。

## 3. 目标与成功指标（Goals & Success Metrics）
- 业务目标：
  - 在 2 个月内上线可用的 MVP，支持单用户完成完整回测流程。
  - 建立可验证的商业化路径（软计费占位）。
- 成功指标（示例）：
  - D7 留存 ≥ 25%，月度活跃用户 MAU ≥ 100。
  - 首批 50 名内测用户完成 ≥ 3 次回测。
  - 回测队列平均等待时间 ≤ 30 秒，95 分位 ≤ 2 分钟（在压力下）。
  - 软计费页转化信号：≥ 15% 用户查看价格页；≥ 10% 点击“订阅占位”。

## 4. 范围（Scope）
### 4.1 MVP 范围（In Scope）
- 前端：Next.js（App Router）。
- 鉴权与存储：Supabase（Auth + Postgres + Storage）。
- 数据源：Tushare（先日线/5/15分钟线；不做实时）。
- 回测引擎：Python 服务化，优先 `vectorbt`（可选 Backtrader）。
- 作业编排：Redis 队列；Python worker（RQ/Celery 二选一）。
- 功能：
  1) 一键回测：内置策略模板 + 代码编辑器 + 回测提交与结果浏览。
  2) 参数网格寻优：笛卡尔积生成、并发队列、早停与重试。
  3) 绩效可视化：收益/回撤/夏普 + 交易列表 + 基础图表模板（ECharts/Recharts）。
- 策略管理最小集：策略注册/元数据/标签，requirements 依赖声明，版本先用时间戳。
- 合规与声明：研究用途免责声明；数据频控与重试策略。

### 4.2 非范围（Out of Scope for MVP）
- 实盘交易与 Tick 级别数据。
- 多租户与团队协作（分享、评论、审计）。
- 实际扣费支付对接（Stripe 等）；仅“软计费”占位。

## 5. 关键假设与反转（Assumptions & Reversals）
- 基本假设：
  - 非实时数据足以承载早期研究与验证。
  - vectorbt 向量化指标适合高并发读写的寻优场景。
  - Supabase 能显著降低集成复杂度，利于 2 个月节奏。
- 反转探索（用于路线灵活性）：
  1) 混合模式：本地轻客户端（Tauri/Electron/CLI）+ 云端同步元数据与统计（非源码）。
  2) 自托管：Next.js 前端改为 Docker + Fly/Render/自建，统一 DevOps 与网络边界。
  3) 软计费：展示 Free/Pro 与配额规则，记录使用量但不触发扣费。

## 6. 技术架构（High-level Architecture）
- 前端：Next.js（Vercel 或自托管），与后端 Python 服务通过 REST/WebSocket 交互。
- 后端服务：
  - API 网关/应用服务（可由 Next.js API routes 或独立 Node/Python 网关提供）。
  - 回测服务与 Worker（Python，与 Redis 通信，执行回测作业与寻优任务）。
- 数据层：
  - Supabase Postgres（策略元数据、作业、结果摘要、用户数据）。
  - 对 Tushare 做频控与缓存（必要时加中间缓存层）。
- 队列：Redis（作业排队、并发控制、重试、早停）。
- 可视化：前端 ECharts/Recharts；统一结果数据模型（equity curve、trades、stats）。

## 7. 数据与接口（Data & APIs）— 草案方向
- 统一结果数据模型（建议字段）：
  - EquityCurve：时间戳、净值、基准净值（可选）。
  - Trades：交易ID、时间、方向、数量、价格、费用、持有期、盈亏。
  - Stats：收益率、最大回撤、夏普、胜率、交易次数、持仓时间等。
- 回测 API（建议）：
  - POST `/api/backtest/submit`：提交策略代码、参数、数据区间、频率；返回 `jobId`。
  - GET `/api/backtest/status?jobId=`：查询作业状态（queued/running/succeeded/failed/early-stopped）。
  - GET `/api/backtest/result?jobId=`：获取结果摘要与下载链接（或流式片段）。
- 寻优 API（建议）：
  - POST `/api/opt/grid/submit`：提交参数空间与策略标识；返回 `optJobId`。
  - GET `/api/opt/grid/status?optJobId=`、`/result?optJobId=`：状态与汇总结果。

## 8. 时间计划（Timeline & Milestones）
- 迭代 1（~1.5 周）：一键回测
  - 设计统一结果模型 → 定义回测 API → 编辑器与策略模板 → 结果页展示。
- 迭代 2（~1 周）：参数网格寻优 + 队列并发
  - 队列与 worker 选型 → 参数组合生成器 → 作业生命周期（提交/执行/早停/重试）。
- 迭代 3（~1 周）：绩效可视化
  - 指标计算 → 图表组件 → 交易列表与导出。
- 持续项：鉴权与策略管理最小集、合规声明、基础监控与日志。

## 9. 风险与缓解（Risks & Mitigations）
- 数据频控与稳定性：
  - 缓解：本地/边缘缓存、退避与重试、限流；优先离线批拉取与增量策略。
- 作业排队与资源上限：
  - 缓解：队列并发阈值、超时与早停、按用户配额限制（与软计费联动）。
- 依赖隔离与安全：
  - 缓解：策略依赖 `requirements` 声明 + 沙箱/容器化执行；清晰隐私边界。
- 运维复杂度（若自托管）：
  - 缓解：IaC 模板化、日志与可观测性预置、灰度与回滚流程。

## 10. 依赖与选型（Dependencies）
- 前端：Next.js、ECharts/Recharts。
- 身份与存储：Supabase（Auth、Postgres、Storage）。
- 回测引擎：vectorbt（优先）/Backtrader。
- 队列与执行：Redis + Python worker（RQ/Celery）。
- 数据源：Tushare（日线、5/15 分钟线）。

## 11. 非功能性需求（NFRs）
- 性能：回测排队 P95 ≤ 2 分钟；结果下载/渲染在 2 秒内完成首屏概要。
- 可观测性：基础日志、作业状态追踪、错误告警。
- 安全与合规：用户数据隔离、最小权限访问、研究用途免责声明清晰可见。

## 12. 开发下一步（Next Steps）
1) 固化 `docs/roadmap.md` 的迭代里程碑与依赖清单。  
2) 输出接口与数据模型更详细的草案（OpenAPI/ERD）。  
3) 选型并打样队列与 worker（含超时/早停/重试与指标采集）。  
4) 定义“软计费”占位页面与配额规则，接入使用量记录。

---

> 本简报基于 `docs/brainstorming-session-results.md` 的共识沉淀，供产品、工程与运营对齐与执行参考。
