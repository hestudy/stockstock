## Monitoring and Observability

### Monitoring Stack

- 前端监控：Vercel Analytics（可选）+ Sentry Frontend SDK
- 后端监控：OpenTelemetry（HTTP/DB/队列链路）+ Prometheus（自托管时）
- 错误追踪：Sentry（前后端统一项目，以标签区分）
- 性能监控：API P95/P99、队列等待时间、Worker 执行时间、失败率、重试次数

### 指标基线（示例）

- API：`http_server_duration_seconds_bucket`（按路由/状态码打 label）
- 队列：`queue_wait_seconds`、`job_exec_seconds`、`job_retry_total`、`job_failure_total`
- 业务：`backtests_submitted_total`、`optimizations_running`、`opt_topn_ready_total`

### 采集与导出（要点）

- 前端：Sentry + Web Vitals；关键页面（结果页）打自定义埋点（摘要渲染时间）
- 后端：OTel SDK + 导出器（Console/OTLP）到 APM 或自托管栈
- Workers：结构化日志 + 指标暴露端点/PushGateway（若自托管）

Rationale

- 与 PRD NFR 对齐，保证性能目标可量化且可告警。
- 统一监控栈降低排障成本，支持从用户前端到后端/队列/Worker 的端到端追踪。
