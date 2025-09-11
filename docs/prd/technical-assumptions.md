# Technical Assumptions

## Repository Structure
- 建议 Monorepo：`web-frontend(Next.js)`, `api-gateway(可先用 Next.js API routes)`, `backtest-service(Python)`, `workers(Python RQ/Celery)`, `infra`, `shared`。

## Service Architecture
- 建议 Monolith（前端 + 轻 API 层）+ 独立 Python 回测/寻优服务 + Redis 队列；避免过早微服务化。

## Testing Requirements
- 建议 Unit + Integration（关键路径最小 e2e：登录→提交→查看结果首屏）。

## Additional Assumptions
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
