# Brainstorming Session Results

**Session Date:** 2025-09-10 12:38 (UTC+8)
**Facilitator:** Business Analyst Mary
**Participant:** 学不会的何同学

---

## Executive Summary

- Topic: A股量化策略回测终端（面向个人量化交易者的云端SaaS）
- Goals: 聚焦式创意；2个月MVP；技术栈 Next.js；数据源 Tushare；云端部署
- Techniques Used: Morphological Analysis（已完成第1轮形态分析与收敛）, Assumption Reversal（已完成）
- Total Ideas Generated: 13 项关键参数决策 + 6 条洞见 + 3 个连接 + 3 条反转命题

---

## Technique Sessions

### Morphological Analysis - 第1轮完成

**Description:** 列出关键参数轴及其可选项，通过组合探索以筛选MVP最小可行集合与优先路线。

#### Ideas Generated
1. 目标用户与权限：单用户个人版（MVP），后续再演进到小团队/多租户
2. 数据接入（Tushare）：日线 + 5/15 分钟线；暂不做实时；关注频控与配额
3. 数据存储：Supabase（Postgres + Auth + Storage 一体化）
4. 回测引擎与语言：Python 服务化 +（vectorbt 或 Backtrader 二选一，优先 vectorbt 以便快速指标计算）
5. 策略研究工作流：内置代码编辑器 + 策略模板 + 回测队列与结果浏览（不做在线 Notebook）
6. 参数寻优：网格搜索 + 队列并发；预留贝叶斯优化为后续增强
7. 作业编排与执行：与回测语言一致；若选 Python 引擎则用 Python worker（如 RQ/Celery）；队列用 Redis
8. 可视化报表与指标：收益/回撤/夏普 + 基本风格暴露 + 交易列表 + 图表模板（ECharts/Recharts）
9. 策略管理：策略注册/元数据/标签 + requirements 依赖声明；版本先用时间戳
10. 鉴权与计费：Supabase Auth；计费暂不上线（或占位 Free/Pro 不接 Stripe）
11. 前端与部署：Next.js（Vercel 托管）；后端独立服务（Python 回测/worker）托管至云主机（Render/Fly/自建）
12. 合规与声明：研究用途免责声明；数据频控与重试策略
13. MVP 边界：不做实盘、不做 Tick、优先沪深主板+常用指数、仅单用户

#### Insights Discovered
- Supabase 将 Auth/DB/Storage 统一，显著降低集成复杂度，利于 2 个月 MVP 节奏
- 先不做实时、聚焦日线/分钟线，有助于规避 Tushare 频控瓶颈并简化缓存策略
- Python + vectorbt 的指标向量化优势适合参数寻优的高并发读写场景
- 将寻优限定为网格搜索 + 并发队列，配合早停规则，MVP 可控且易观察
- 将“研究工作流”聚焦在内置编辑器与模板，有利于引导用户快速产出可回测策略
- 前后端解耦（Vercel + 独立 Python 服务）降低部署风险，便于按需水平扩展

#### Notable Connections
- Supabase 提供 Auth 与 Storage，可与 Next.js App Router 无缝对接
- Next.js（Vercel）前端与 Python 回测服务通过 REST/WebSocket 交互，便于作业状态与结果流转
- Redis 队列既服务参数寻优并发，也可统一回测作业编排，减少系统组件种类

---
### Assumption Reversal - 完成

**Description:** 选择若干对 MVP 影响较大的核心假设进行“反转”，寻找更简化或更高价值/更低成本路径。

#### Ideas Generated
1. 编号 5（必须云端部署）
   - 反转命题：如果提供“本地轻客户端（桌面壳/CLI）+ 云端账号同步”的混合模式呢？
   - 可能方案：Tauri/Electron 轻壳跑本地小回测；云端仅同步策略元数据与结果摘要（非全量数据）。
   - 收益：小实验零延迟，弱网环境可用，降低后端算力与云成本。
   - 风险与缓解：多端一致性与同步复杂；阶段性仅同步元数据与统计汇总，明确定义不落地源码的隐私边界。
2. 编号 8（必须 Next.js + Vercel）
   - 反转命题：如果前端仍用 Next.js，但改为自托管（Docker + Fly/Render/自建）以统一 DevOps 呢？
   - 可能方案：前后端同云商部署；使用 GitHub Actions + IaC（Terraform）标准化流水线与环境。
   - 收益：部署链路与观测更可控；便于统一网关、日志、SSO 与私有网络策略。
   - 风险与缓解：丧失 Vercel 极简托管优势；以模板化流水线与预置监控面板降低维护负担。
3. 编号 9（MVP 暂不上线计费）
   - 反转命题：如果 MVP 提供“软计费”（价格页 + 订阅占位 + 使用配额可见）但暂不接第三方支付呢？
   - 可能方案：前端展示 Free/Pro 与配额规则；后端记录使用量但不触发扣费；到位后再一键接 Stripe。
   - 收益：验证商业路径与价格敏感度，提前收集候补付费信号。
   - 风险与缓解：用户预期管理；清晰标注“内测/试运行/价格未最终确定”。

#### Insights Discovered
- “混合模式”有助于在早期控制云成本与后端规模，同时给重研究用户更顺滑的体验。
- 自托管统一 DevOps 与网络边界，利于合规与可观测性；对小团队的运维心智要求需用模板化工具平衡。
- 软计费能在不引入复杂支付集成的前提下，尽早验证付费意愿与定价锚点。

#### Notable Connections
- 本地轻客户端与浏览器端“小回测”可以共用统一结果 schema，前后端展示层无缝复用。
- 自托管与后端 Python 服务放同一云商/同一私网，能降低跨域/跨网复杂度与延迟。
- 软计费与配额信息可直接接入“回测提交面板/结果页”，形成正向引导与容量提示。

---
## Idea Categorization

### Immediate Opportunities
1. 内置策略模板 + 代码编辑器 + 一键回测
   - 为什么立即可做：前端与后端接口清晰，工作量可控
   - 资源：Next.js 前端、回测 API、Supabase 表结构
   - 约束：需要最小化策略依赖并隔离执行环境
2. 参数网格寻优 + 队列并发
   - 为什么立即可做：实现简单（笛卡尔积迭代 + 任务队列）
   - 资源：Redis、Python worker、参数组合生成器
   - 约束：需要作业超时/早停/失败重试
3. 绩效可视化（收益/回撤/夏普）
   - 为什么立即可做：指标计算与图表库成熟
   - 资源：vectorbt/自研指标、ECharts/Recharts 组件
   - 约束：统一结果数据模型（equity curve、trades、stats）

### Future Innovations
1. 贝叶斯优化/遗传算法寻优
   - 需要开发：超参空间建模、采集器与停机准则
   - 时间：1-2 个迭代
2. 风格因子更细致的暴露与绩效归因
   - 需要开发：多因子暴露模型、行业/市值分层
   - 时间：1 个迭代
3. 多租户与团队协作（分享、评论、复盘模板）
   - 需要开发：租户隔离、RBAC、审计
   - 时间：2-3 个迭代

### Moonshots
1. 策略商店与一键订阅回测
   - 潜力：平台化网络效应
   - 挑战：合规、风控、版权与安全
2. 实盘仿真到轻量实盘
   - 潜力：转化为付费与粘性
   - 挑战：券商接口、风控与合规

### Insights & Learnings
- “小而精”的 MVP 切片比“一步到位”更安全，便于验证核心假设
- 统一数据模型是跨报表/指标复用的关键
- 参数寻优要设定资源上限和早停，避免长尾耗时

---
## Action Planning

### Top 3 Priority Ideas
#### #1 Priority: 一键回测（策略模板 + 编辑器 + 回测 API）
- Rationale: 直击核心价值闭环（编辑-回测-查看结果）
- Next steps: 设计结果数据模型 -> 定义回测 API -> 搭建编辑器与模板 -> 打通展示
- Resources: Next.js、Supabase、Python 引擎（vectorbt/Backtrader）
- Timeline: 1.5 周

#### #2 Priority: 参数网格寻优 + 队列并发
- Rationale: 显著提升体验（自动化探索参数空间）
- Next steps: 选型队列与 worker -> 设计参数组合生成器 -> 作业生命周期（提交/执行/早停/重试）
- Resources: Redis、Python worker（RQ/Celery）、监控日志
- Timeline: 1 周

#### #3 Priority: 绩效可视化（收益/回撤/夏普 + 交易列表）
- Rationale: 可视化形成“可感知的价值”
- Next steps: 定义统一结果 schema -> 指标计算 -> 前端图表组件
- Resources: 指标库、ECharts/Recharts
- Timeline: 1 周

> 总体 MVP 目标：在 2 个月内实现上述 3 大能力 + 基础鉴权与策略管理最小集。

---
## Reflection & Follow-up
- 做得好的地方：快速收敛关键参数与最小可行组合；技术路径清晰
- 待探索的领域：更丰富的绩效归因、因子暴露、计算加速策略
- 推荐后续技术：假设反转（验证边界）、SCAMPER（扩展功能组合）
- 下次会话建议：进入“假设反转”验证是否可以进一步简化后端与降低成本

