# Contributing to StockStock

感谢你对本项目的贡献！本指南帮助你在本地开发、提交代码和执行测试，以确保一致性和高质量交付。

## 开发准备

- Node.js 20 + pnpm 9
- 安装依赖：

```bash
pnpm install
```

- 配置 Web 环境变量：
  - 复制 `apps/web/.env.example` 为 `apps/web/.env.local` 并填充必需项

## 运行与调试

- 启动 Web 开发服务器：

```bash
pnpm -w --filter web dev
```

- 运行单元测试（Vitest）：

```bash
pnpm -w --filter web test
```

- 运行端到端测试（Playwright）：

```bash
cd apps/web && npx playwright install --with-deps && cd -
pnpm -w --filter web e2e
```

## 环境变量（Web）

- 必填：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- 可选：
  - `E2E_SUPABASE_EMAIL` / `E2E_SUPABASE_PASSWORD`（启用真实登录 E2E）
  - `E2E_BASE_URL`（覆盖 Playwright baseURL）

## 代码规范

- 参考 `docs/architecture/12-coding-standards.md`
- 命名与结构请遵循 `docs/architecture/07-frontend-architecture.md`
- 提交信息使用 Conventional Commits，例如：`feat(web): add HealthCard timestamp test`

## PR 要求清单（节选）

- 关联故事与动机说明
- 变更前后截图（前端）或接口示例（后端）
- 本地通过：lint、单测、必要的 E2E
- 风险与回滚方案（如涉及数据库或关键路径）

## CI 集成

- 工作流：`.github/workflows/web-e2e.yml`
- 必填仓库 Secrets：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `E2E_SUPABASE_EMAIL`
  - `E2E_SUPABASE_PASSWORD`
- 失败排查：下载 `apps/web/playwright-report/` 工件查看 Trace 与截图

## 提问与建议

- 发现文档缺失或问题，欢迎提交 Issue 或 PR！
