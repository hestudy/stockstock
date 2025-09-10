## Frontend Architecture

本节定义前端的组件组织、模板规范、状态管理、路由结构与服务层，确保与 `packages/shared` 的类型契约一致，并满足“摘要先行 → 曲线 → 明细”的性能策略。

### Component Architecture

#### Component Organization

```text
apps/web/
  src/
    app/                      # Next.js App Router 根
      (auth)/                 # 认证相关段
      (dashboard)/            # 登录后核心应用
        backtests/
          page.tsx           # 列表/提交入口
          [id]/
            page.tsx         # 结果详情（摘要→曲线→明细）
        optimizations/
          page.tsx
          [id]/
            page.tsx
        settings/
          quotas/page.tsx
      layout.tsx
      page.tsx                # 登录/欢迎页
      api/                    # （可选）仅限轻 API 代理/边缘逻辑
    components/
      charts/                 # ECharts 组件（懒加载）
      forms/                  # 提交/参数表单
      layout/                 # 布局与导航
      feedback/               # Toast/Empty/Error 等
    services/                 # 前端服务层（API Client 封装）
    stores/                   # Zustand/Query 等状态
    utils/                    # 工具/格式化/guard
    styles/
```

#### Component Template（示例）

```tsx
// apps/web/src/components/charts/EquityCurve.tsx
import React from "react";
import dynamic from "next/dynamic";

const ECharts = dynamic(() => import("echarts-for-react"), { ssr: false });

type Props = {
  series: Array<{ time: string; value: number }>;
  height?: number;
};

export function EquityCurve({ series, height = 300 }: Props) {
  const option = {
    tooltip: { trigger: "axis" },
    xAxis: { type: "category", data: series.map((s) => s.time) },
    yAxis: { type: "value" },
    series: [{ type: "line", data: series.map((s) => s.value), smooth: true }],
  };
  return <ECharts option={option} style={{ height }} />;
}
```

### State Management Architecture

#### State Structure（Zustand + SWR/TanStack Query 可选）

```ts
// apps/web/src/stores/useJobsStore.ts
import { create } from "zustand";

type JobStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "early-stopped"
  | "canceled";

type Job = { id: string; status: JobStatus; progress?: number };

type JobsState = {
  items: Record<string, Job>;
  upsert: (job: Job) => void;
};

export const useJobsStore = create<JobsState>((set) => ({
  items: {},
  upsert: (job) => set((s) => ({ items: { ...s.items, [job.id]: job } })),
}));
```

#### State Patterns

- 使用 `stores/` 维护轻量全局态（作业状态/用户态）。
- 数据获取优先使用服务层 + SWR/TanStack Query（含缓存/重试/失效策略）。
- 结果页采用分步加载：先 `GET /backtests/{id}/status` 与摘要，再按需拉取曲线/明细。

### Routing Architecture

#### Route Organization（App Router）

```text
app/
  page.tsx                 # 登录/欢迎
  (dashboard)/
    layout.tsx
    backtests/page.tsx
    backtests/[id]/page.tsx
    optimizations/page.tsx
    optimizations/[id]/page.tsx
    settings/quotas/page.tsx
```

#### Protected Route Pattern（Supabase Auth）

```tsx
// apps/web/src/app/(dashboard)/layout.tsx
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/services/supabaseServer";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return <>{children}</>;
}
```

### Frontend Services Layer

#### API Client Setup

```ts
// apps/web/src/services/apiClient.ts
export const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "/api/v1";

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  get: <T>(path: string) => http<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    http<T>(path, { method: "POST", body: JSON.stringify(body) }),
};
```

#### Service Example

```ts
// apps/web/src/services/backtests.ts
import { api } from "./apiClient";

export type BacktestSubmitRequest = {
  versionId: string;
  params: Record<string, any>;
};
export type BacktestSubmitResponse = { id: string; status: string };
export type BacktestStatusResponse = {
  id: string;
  status: string;
  progress?: number;
};
export type ResultSummary = {
  id: string;
  metrics: Record<string, number>;
  equityCurveRef?: string;
};

export const submitBacktest = (payload: BacktestSubmitRequest) =>
  api.post<BacktestSubmitResponse>(`/backtests`, payload);

export const getBacktestStatus = (id: string) =>
  api.get<BacktestStatusResponse>(`/backtests/${id}/status`);

export const getBacktestResult = (id: string) =>
  api.get<ResultSummary>(`/backtests/${id}/result`);
```

Rationale

- 组件按领域组织，图表懒加载，减少首屏体积。
- Auth 在布局层保护路由，避免页面内部重复校验。
- 服务层封装 HTTP/错误，统一与 `packages/shared` 类型，便于替换底层实现（如切换到 BFF）。
