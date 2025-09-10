## Coding Standards

本节仅包含“短而强约束”的高收益规则，用于指导 AI 与人工协作的日常开发，避免常见低级错误。若与其他规范冲突，以本节为准。

### Critical Fullstack Rules

- **Type Sharing**：所有请求/响应与核心实体类型必须定义在 `packages/shared/` 并从那里导入。前端/API/Workers 禁止各自私有重复定义。
- **Service Layer Only**：前端组件禁止直接 `fetch` 后端；一律经 `apps/web/src/services/` 服务层，统一错误格式与重试/缓存策略。
- **Env Access**：禁止在业务代码中直接散用 `process.env`；集中在 `config` 模块读取并导出显式字段，便于可测与审计。
- **Error Handling**：API 必须返回统一 `ApiError` 结构；Workers 必须分类错误（参数/执行/外部依赖），不得吞错。
- **State Management**：禁止在 React 中直接可变更新状态；遵循 Zustand/Query 不可变模式并最小化全局态。
- **Result Loading**：结果页严格执行“摘要 → 曲线 → 明细”的分步加载，不得一次性取全量明细。
- **Repository Pattern**：后端数据访问统一走 Repository 层，禁止在路由/控制器内直接发 SQL/SDK 调用。
- **Logging**：统一结构化日志（Pino/structlog），禁止 `console.log` 残留到生产。日志内不得输出敏感数据（令牌/密钥）。
- **Rate Limit/Idempotency**：提交类接口需具备速率限制与运行幂等键（如 `clientRequestId`）；避免重复触发。
- **Security Defaults**：默认最小权限；Supabase Service Key 只在可信后端使用；前端仅使用 ANON Key。

### Naming Conventions

| Element            | Frontend              | Backend    | Example                      |
| ------------------ | --------------------- | ---------- | ---------------------------- |
| Components         | PascalCase            | -          | `BacktestResult.tsx`         |
| Hooks              | camelCase with `use`  | -          | `useBacktestStatus.ts`       |
| API Routes         | -                     | kebab-case | `/api/backtests/{id}/status` |
| Repository Classes | -                     | PascalCase | `BacktestRepo`               |
| Database Tables    | -                     | snake_case | `backtest_jobs`              |
| Columns            | -                     | snake_case | `result_summary_id`          |
| Shared Types       | PascalCase (TS types) | PascalCase | `ResultSummary`              |
| Files              | kebab-case            | kebab-case | `result-summary.ts`          |

### Commit & PR

- **Conventional Commits**：`feat: xxx`、`fix: yyy`、`refactor: zzz`、`docs: ...`、`test: ...`；范围可用 `web|api|workers|shared|infra`。
- **PR Checklist**：
  - 对应 Story/Issue 链接，描述动机与影响面。
  - 包含变更前后截图（前端）或接口示例（后端）。
  - 通过本地/CI 单元与集成测试；关键路径 E2E（如适用）。
  - 风险与回滚方案（特别是数据库/队列相关）。

### Lint & Formatter（建议）

- 前端/后端 TS：ESLint + Prettier（与上表命名一致，开启 import/order）。
- Python：ruff/flake8 + black + isort；开启 `pydantic` 严格校验。
- CI 阶段执行 `lint` 与 `typecheck`，阻断不合规提交。

Rationale

- 最小规则覆盖高频错误面，直接服务于可维护性、稳定性与安全性。
- 统一类型与服务层边界，保障跨栈一致性与可测试性。
