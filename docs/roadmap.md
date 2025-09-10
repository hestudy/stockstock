# MVP Roadmap（2 个月）

参与者：学不会的何同学  
产品：A股量化策略回测终端（个人量化交易者云端SaaS）  
当前版本：v0.1（规划稿）

错误码：`NOT_FOUND | UNAUTHORIZED | FORBIDDEN | INTERNAL_ERROR`

### 错误响应模型
```json
{
  "error": {
    "code": "INVALID_INPUT",
    "message": "missing field: context.window",
    "details": { "field": "context.window" }
  }
}
```

可用错误码集合：
- `INVALID_INPUT` 输入无效
- `NOT_FOUND` 资源不存在
- `UNAUTHORIZED` 未登录或令牌无效
- `FORBIDDEN` 权限不足（RLS 拒绝）
- `RATE_LIMITED` 频控限制
- `CONFLICT` 资源冲突（重复取消/重复提交）
- `INTERNAL_ERROR` 服务端异常
- `UPSTREAM_ERROR` 上游依赖失败（如数据源）

### 状态机与事件
- 状态：`queued -> running -> (succeeded | failed | cancelled)`
- 事件：`enqueued`, `started`, `progress(n)`, `succeeded`, `failed(err)`, `cancelled`
- 队列：Redis（建议 channel/topic：`runs.{runId}` 发布事件；或使用队列系统事件总线）
- 进度：0-100，至少在 `started/succeeded/failed/cancelled` 时更新；长任务周期性 `progress` 心跳

### 幂等与重试
- `Idempotency-Key`：同 key + 相同请求体 → 返回首个成功结果
- 重试策略：网络/5xx 指数退避；对于 `CONFLICT` 不自动重试
- 取消语义：幂等（多次取消返回 204 或等价语义）

### 限流与配额（软计费占位）
- header 返回：`X-RateLimit-Limit` / `X-RateLimit-Remaining` / `X-RateLimit-Reset`
- 软配额：按账户 Free/Pro 展示提示，不阻断核心路径（MVP 可仅提示）

### 安全与合规
- 仅返回当前用户（owner）可访问资源（依赖 Supabase RLS）
- 产物默认私有；只读快照需显式开启并生成短期签名 URL
- 日志与错误信息避免泄露策略源码/密钥

---
## 目标与范围
- 目标：在 8 周内交付 MVP 的三大核心能力：
  1) 一键回测（策略模板 + 编辑器 + 回测 API）
  2) 参数网格寻优 + 队列并发
  3) 绩效可视化（收益/回撤/夏普 + 交易列表）
- 约束：Next.js 前端；Tushare 数据（先日线+5/15min）；云端部署；Python 回测服务；Supabase（Auth/DB/Storage）
- 边界：不做实时、不做 Tick、不接入实盘、不含完整多租户

---
## 成功指标（来自简报）
- D7 留存 ≥ 25%，月度活跃用户 MAU ≥ 100。
- 首批 50 名内测用户完成 ≥ 3 次回测。
- 回测队列平均等待时间 ≤ 30 秒，95 分位 ≤ 2 分钟（在压力下）。
- 软计费信号：≥ 15% 用户查看价格页；≥ 10% 点击“订阅占位”。

---
## 里程碑（按周）

### M1（W1-W2）基础骨架与数据模型
- 前端（Next.js）：项目脚手架、Auth 集成（Supabase）、基础导航
- 后端（Python 回测服务）：服务脚手架、健康检查；与队列（Redis）连通性验证
- 数据与Schema：
  - 结果统一数据模型（equity_curve、trades、stats、params、artifacts）定义
  - Supabase 表：users、strategies、backtests、backtest_runs、metrics、artifacts
- 完成标准：前后端能打通“登录 -> 提交一个假回测 -> 返回固定样例结果并落库”

### M2（W3-W4）一键回测闭环
- 策略模板与编辑器：代码编辑器（高亮/基本校验）、内置策略模板（1-2 个）
- 回测 API：提交/查询/取消；结果写入统一 schema；基础错误处理
- Tushare 数据接入：日线优先；缓存与频控处理（简单节流）
- 可视化：收益曲线/回撤/基础统计（先不强制夏普，预留指标插槽）
- 完成标准：用户可基于模板修改参数 -> 一键回测 -> 查看曲线与统计；结果可复现

### M3（W5）参数网格寻优 + 队列并发（阶段1）
- 队列作业：参数组合生成（笛卡尔积），提交批量回测任务；并发控制、失败重试
- 作业状态机：queued/running/succeeded/failed/cancelled；进度与估时
- 早停与预算：每批最大评估次数、超时、手动停止
- 完成标准：UI 可发起网格寻优（小规模），查看批量结果对比

### M4（W6）可视化增强与报表整合
- 图表模板化：多策略对比、回撤区间高亮、参数-绩效热力图
- 交易明细/持仓列表：分页查看与导出 CSV
- 结果快照：生成分享链接（只读、无源码），用于轻协作
- 完成标准：多策略结果对比清晰，支持分享只读链接

### M5（W7）稳定性与体验优化
- 错误与观测：结构化日志、集中错误上报（Sentry 可选）、关键指标监控
- 可靠性：重试与幂等、数据库索引调优、清理任务与归档策略
- 安全与合规：研究用途免责声明、速率限制与API键管理
- 完成标准：关键路径无高频错误；性能与稳定性满足小规模用户

### M6（W8）发布准备与软计费（占位）
- 价格页与配额提示：展示 Free/Pro 占位与配额（软计费，不接支付）
- 文档与引导：新手教程、示例策略、FAQ、问题反馈通道
- 部署：灰度发布与回滚策略；演示数据与演示账号
- 完成标准：可向早期用户开放试用；具备收集转化信号与问题反馈能力

---
## 里程碑依赖矩阵（简要）
- M1（骨架与数据模型）
  - 依赖：Supabase（Auth/Postgres）、Redis（连通性验证）、Python 回测服务脚手架
  - 风险：Schema 初版不完善 → 缓解：以“统一结果模型”驱动，支持增量迁移
- M2（一键回测闭环）
  - 依赖：策略模板、代码编辑器、回测 API、Tushare（日线）
  - 风险：频控/缓存不足 → 缓解：节流与本地缓存，样例数据兜底
- M3（网格寻优 + 并发）
  - 依赖：Redis 队列、Python worker（RQ/Celery）、早停/重试策略
  - 风险：资源上限与作业拥塞 → 缓解：配额与预算、超时、幂等取消
- M4（可视化增强）
  - 依赖：统一结果 schema、ECharts/Recharts、多策略对比与热力图
  - 风险：前端渲染性能 → 缓解：虚拟化与分块加载、降采样
- M5（稳定性与体验）
  - 依赖：监控/日志（Sentry 可选）、数据库索引与归档策略
  - 风险：隐性错误与偶发抖动 → 缓解：结构化日志、报警阈值、灰度回滚
- M6（发布与软计费）
  - 依赖：价格页与配额提示、分享只读快照、文档与引导
  - 风险：商业信号不足 → 缓解：AB 测试与埋点、意向收集表单

---
## 工作流与责任分工（建议）
- 前端（Next.js）：UI/路由、编辑器、结果可视化、状态轮询与进度、分享快照
- 后端（Python）：回测核心、指标计算、参数组合、作业生命周期、Tushare 适配与缓存
- BFF/API（可选）：Next.js API routes 或独立 Node 层，负责鉴权、签名、限流与网关
- 数据与平台：Supabase schema、迁移、权限策略（RLS 可选）、对象存储（图/报告）
- DevOps：环境与部署、日志监控、告警、备份策略

---
## 统一结果数据模型（draft）
```text
backtests
- id, strategy_id, created_by, created_at
- context: {universe, frequency, window, datasource_version}

backtest_runs
- id, backtest_id, params(jsonb), status, started_at, finished_at, budget_ms
- artifacts: {equity_curve_path, trades_path, logs_path}
- stats: {pnl, return, max_dd, sharpe?, sortino?}

strategies
- id, name, tags, entry_file, requirements, version(ts)
```
说明：
- artifacts 存储在 Supabase Storage；页面按路径读取
- stats 字段按可选扩展（夏普可后置，但保留插槽）

---
## 接口草案（简要）
- POST `/api/backtests`：创建回测（策略引用/代码、参数、数据窗口）
- POST `/api/backtests/{id}/runs`：提交一次运行或一组参数网格
- GET `/api/backtests/{id}/runs/{runId}`：查询状态与结果
- POST `/api/backtests/{id}/runs/{runId}:cancel`：取消
- GET `/api/runs/{runId}/artifacts/{type}`：下载 equity/trades/logs/csv

---
## 接口详细规范（API Spec）

### 通用
- 鉴权：`Authorization: Bearer <supabase_jwt>`（来自 Supabase Auth）
- 接受与返回：`Content-Type: application/json; charset=utf-8`
- 幂等：写操作支持 `Idempotency-Key` 请求头（UUID），同键在 24h 内返回相同结果
- 版本：预留 `Accept: application/vnd.backtest.v1+json`

### 1) 创建回测
POST `/api/backtests`

请求示例：
```json
{
  "strategyRef": { "strategy_id": "<uuid>" },
  "context": {
    "universe": ["000001.SZ", "600519.SH"],
    "frequency": "1d",
    "window": { "start": "2019-01-01", "end": "2024-12-31" },
    "datasource_version": "tushare:v1"
  },
  "notes": "均线策略评估（MVP）"
}
```

响应：
```json
{ "backtest_id": "<uuid>" }
```

错误码：`INVALID_INPUT | UNAUTHORIZED | INTERNAL_ERROR`

可选：也可用 `strategyRef.code` 直接提交简短策略代码/模板引用（后端持久化到 Storage 并注册元数据）。

### 2) 提交运行 / 网格寻优
POST `/api/backtests/{id}/runs`

请求示例（单次运行）：
```json
{
  "mode": "single",
  "params": { "ma_short": 5, "ma_long": 20 },
  "budget_ms": 600000,
  "priority": 5
}
```

请求示例（网格）：
```json
{
  "mode": "grid",
  "gridSpec": {
    "ma_short": [5, 10, 20],
    "ma_long": [30, 60]
  },
  "budget_ms": 1200000,
  "max_evals": 36,
  "early_stop": { "metric": "return", "mode": "max", "patience": 5 }
}
```

响应：
```json
{ "run_ids": ["<uuid>", "<uuid>"] }
```

错误码：`INVALID_INPUT | NOT_FOUND | RATE_LIMITED | UNAUTHORIZED | INTERNAL_ERROR`

### 3) 查询运行状态与结果
GET `/api/backtests/{id}/runs/{runId}`

响应示例：
```json
{
  "run_id": "<uuid>",
  "status": "running",
  "progress": 42,
  "started_at": "2025-09-10T04:10:00Z",
  "finished_at": null,
  "params": { "ma_short": 5, "ma_long": 20 },
  "stats": { "return": 0.18, "max_dd": -0.12, "sharpe": 1.1 },
  "artifacts": {
    "equity_curve_path": "artifacts/uid/run/equity.csv",
    "trades_path": "artifacts/uid/run/trades.csv",
    "logs_path": "artifacts/uid/run/log.txt"
  }
}
```

错误码：`NOT_FOUND | UNAUTHORIZED | FORBIDDEN | INTERNAL_ERROR`

### 4) 取消运行
POST `/api/backtests/{id}/runs/{runId}:cancel`

响应：`204 No Content`

错误码：`CONFLICT | NOT_FOUND | UNAUTHORIZED | FORBIDDEN | INTERNAL_ERROR`

### 5) 下载产物
GET `/api/runs/{runId}/artifacts/{type}?format=csv`
- `type`: `equity|trades|logs|report`
- `format`: `csv|json|txt`（按类型约束）

响应：直接二进制/文本内容或带签名 URL（如走 Supabase Storage 签名下载）。
## 验收标准（Top 3 对应）
1) 一键回测
- 用户能从模板创建策略，编辑参数并运行
- 结果页展示收益曲线、回撤与基础统计；支持导出 CSV
- 每次运行可复现（记录策略版本、参数、数据窗口）

2) 参数网格寻优
- UI 可配置参数范围/候选集，显示预计组合数
- 队列并发执行；支持早停/预算/失败重试
- 结果对比视图（表格/热力图），可按指标排序

3) 绩效可视化
- 收益/回撤图表交互流畅（缩放、区间选择）
- 交易明细/持仓可分页查看与导出
- 多策略对比视图稳定，能够对齐时间轴

---
## 风险与缓解
- Tushare 频控：
  - 缓存 + 节流；离线样例数据；重试与退避
- 成本与扩展：
  - 小规模使用前端/本地轻回测（预研）；后端仅接长作业
- 复杂度控制：
  - 严格遵循统一结果 schema；迭代化推进指标与可视化
- 数据一致性与安全：
  - 只读快照不含源码；用户显式启用分享；访问令牌过期

---
## Backlog（按优先级）
- 高
  - 一键回测闭环（前后端打通、结果模型、基础可视化）
  - 网格寻优 + 队列并发 + 早停/预算
  - 结果快照分享（只读）
- 中
  - 夏普/Sortino 等进阶指标组件化
  - 多策略对比与参数-绩效热力图
  - 软计费占位与配额提示
- 低
  - 本地轻客户端（Tauri/Electron）预研
  - 贝叶斯优化/遗传算法（阶段2）
  - 自托管 DevOps 模板化

---
## 跟踪与度量
- 工程度量：部署频次、失败率、平均修复时间、任务排队时间
- 产品度量：回测完成率、平均回测用时、活跃用户数、策略模板使用率、分享链接访问量
- 商业信号：价格页点击率、Pro 意向收集、配额用尽率

---
## 环境变量与配置（Supabase/Redis/回测服务）

### Supabase（前端/后端）
- `NEXT_PUBLIC_SUPABASE_URL`：Supabase 项目 URL（前端可见）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase anon key（前端可见）
- `SUPABASE_SERVICE_ROLE_KEY`：Service Role Key（仅后端/私密）

最小 .env 示例（前端）：
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

最小 .env 示例（后端/worker）：
```env
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Redis（队列与事件）
- `REDIS_URL`：Redis 连接串（如：`redis://default:password@host:6379`）
- 建议主题/频道：`runs.{runId}` 发布作业事件（或使用队列系统自带事件总线）

### 回测服务（Python）
- `DATA_CACHE_DIR`：数据缓存目录（减少 Tushare 频控影响）
- `TUSHARE_TOKEN`：Tushare API Key（仅后端）
- `WORKERS`：并发 worker 数量（与预算/资源匹配）

### 其他（可选）
- `SENTRY_DSN`：错误上报
- `LOG_LEVEL`：日志级别（info/debug）
- `RATE_LIMIT_*`：自定义频控阈值

> 建议：提供 `.env.example` 与“环境变量说明表”以便新成员快速接入；部署管道（GitHub Actions）使用环境密钥注入。
