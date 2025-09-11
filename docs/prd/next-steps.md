# Next Steps

## UX Expert Prompt
请基于本 PRD，输出面向“编辑→回测→结果闭环”的高层 IA（信息架构）与关键交互原型建议，优先：
- 代码编辑器与回测提交在同页的布局分区与信息密度取舍。
- 结果页“概要卡（2s 内可见）→曲线→明细”的分步加载策略。
- 历史作业与复运行的最短路径交互。
- 可达性（WCAG AA）与深色模式实践清单。

## Architect Prompt
请基于本 PRD，给出 MVP 的技术架构与接口契约草案，重点：
- Monorepo 模块划分与代码组织（web/api/backtest/workers/infra/shared）。
- Next.js API routes vs 独立 API 网关的取舍建议与迁移路径。
- 回测/寻优作业状态机、错误分类、重试/早停/取消机制与监控指标表。
- 统一结果模型（字段/类型/口径），示例接口（submit/status/result/opt-grid）。
- 频控与缓存策略（Tushare）、配额/并发限制与软计费联动方案。
