# StockStock

一个基于 Turborepo 的 Monorepo，包含 Web 前端（Next.js App Router）与后端服务占位（Python），并集成 Supabase Auth、健康检查与端到端测试（Playwright）。

## 本地快速开始

1. 安装依赖

```bash
pnpm install
```

2. 配置环境变量

- 复制 `apps/web/.env.example` 为 `apps/web/.env.local` 并填充：

```bash
cp apps/web/.env.example apps/web/.env.local
```

- 必填项：
  - `NEXT_PUBLIC_SUPABASE_URL`：你的 Supabase 项目 URL（例如：https://xxx.supabase.co）
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`：Supabase 匿名 Key（Anon Key）
- 可选项（用于本地 E2E 真实登录）：
  - `E2E_SUPABASE_EMAIL` / `E2E_SUPABASE_PASSWORD`：测试账号的邮箱与密码

3. 启动开发服务器

```bash
pnpm -w --filter web dev
```

默认端口：`http://localhost:3000`

4. 运行测试

- 单元测试（Vitest）：

```bash
pnpm -w --filter web test
```

- 端到端测试（Playwright）：

```bash
# 首次运行需要安装浏览器
cd apps/web && npx playwright install --with-deps && cd -

# 运行 E2E（包含未登录重定向与健康页可见性；若设置了 E2E 账号，将额外运行真实登录用例）
pnpm -w --filter web e2e
```

## 环境变量（Web）

位置：`apps/web/.env.local`

必填：

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

可选：

- `E2E_SUPABASE_EMAIL` / `E2E_SUPABASE_PASSWORD`（用于真实登录 E2E）
- `E2E_BASE_URL`（如需覆盖 Playwright baseURL）

## 目录结构（片段）

```text
apps/
  web/
    src/
      app/
        (dashboard)/
          layout.tsx          # 受保护布局（未登录重定向 /login）
          health/page.tsx     # 健康页
        login/page.tsx        # 登录/注册页
      components/HealthCard.tsx
      services/
        apiClient.ts
        supabaseClient.ts
        supabaseServer.ts
        errors.ts
    e2e/
      auth-health.spec.ts             # 未登录重定向、健康页可见
      auth-health.real-login.spec.ts  # 真实登录（从环境变量读取账号）
```

## CI（GitHub Actions）

工作流：`.github/workflows/web-e2e.yml`

- 在 CI 中运行 Playwright E2E
- 请在仓库 Secrets 中配置：
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `E2E_SUPABASE_EMAIL`
  - `E2E_SUPABASE_PASSWORD`
- 可选：`E2E_BASE_URL`

## 规范与约定

- 代码规范请参考：`docs/architecture/12-coding-standards.md`
- 前端架构：`docs/architecture/07-frontend-architecture.md`
- 技术栈：`docs/architecture/03-tech-stack.md`

如需更多帮助，请查看 `CONTRIBUTING.md`。
