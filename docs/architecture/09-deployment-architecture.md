## Deployment Architecture

### Deployment Strategy

**Frontend Deployment**

- Platform: Vercel（Next.js App Router 原生支持）
- Build Command: `pnpm install && pnpm build`（或 `npm ci && npm run build`）
- Output Directory: `.vercel/output`（按 Vercel 约定）
- CDN/Edge: 由 Vercel 提供；静态资源自动走 Edge/CDN

**Backend/Compute Deployment**

- Python Workers（Backtest/Optimization）
  - 方法 A：自托管（Docker + Compose/K8s）
  - 方法 B：托管平台（如 Fly.io、Render、Railway）
  - 显式设置并发与队列消费数，暴露内部健康探针 `/internal/health`
- Redis
  - 方法 A：Upstash Redis（Serverless/托管）
  - 方法 B：自托管 Redis（EC2/VM/K8s），需开启持久化与监控告警
- Database/Auth/Storage：Supabase（Postgres + Auth + Storage），区域建议 AP-Southeast-1（新加坡）；与计算/Redis 尽量同区/近区

**Networking & Secrets**

- 所有服务通过环境变量注入密钥（Supabase、Redis、Tushare Token 等）
- 限制 Python 服务入站来源（API/队列所在网段或私网）
- 打开只读端点用于健康检查与 canary 页面

### CI/CD Pipeline（GitHub Actions 示例）

```yaml
name: ci
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  web-build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20" }
      - run: npm ci
        working-directory: ./
      - run: npm run -w apps/web build
      - run: npm run -w apps/web test --if-present

  deploy-vercel:
    needs: web-build-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: amondnet/vercel-action@v25
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.VERCEL_ORG_ID }}
          vercel-project-id: ${{ secrets.VERCEL_PROJECT_ID }}
          working-directory: apps/web
          scope: ${{ secrets.VERCEL_ORG_ID }}

  py-workers-build-deploy:
    needs: web-build-test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}
      - name: Build and push image
        uses: docker/build-push-action@v6
        with:
          context: ./services/backtest
          push: true
          tags: ${{ secrets.DOCKERHUB_USERNAME }}/stockstock-backtest:latest
      - name: Deploy (Fly.io example)
        uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        working-directory: ./services/backtest
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

说明

- 以上仅为参考骨架；可替换为 Render/Railway/自托管流水线脚本。
- 建议在部署前执行数据库迁移（例如 `supabase db push` 或自管 `psql` 脚本）。

### Environments

| Environment | Frontend URL                | Backend (Workers) URL/Notes         | Purpose              |
| ----------- | --------------------------- | ----------------------------------- | -------------------- |
| Development | http://localhost:3000       | docker-compose: http://localhost    | 本地开发与联调       |
| Staging     | https://staging.example.com | workers: staging（托管或自托管）    | 预发布/回归测试      |
| Production  | https://app.example.com     | workers: prod（同区/近区 Redis/DB） | 线上环境（监控告警） |

环境变量（建议）

- 前端（.env.local）：`NEXT_PUBLIC_API_BASE`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- API/Serverless：`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `REDIS_URL`, `TUSHARE_TOKEN`
- Workers（Python）：`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `REDIS_URL`, `TUSHARE_TOKEN`
