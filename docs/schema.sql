-- Supabase/Postgres DDL for unified backtesting schema
-- Product: A股量化策略回测终端（个人量化SaaS）
-- Version: v0.1 (MVP)

-- NOTE:
-- - Supabase 自带 auth.users 作为用户源，本 schema 使用 profiles 作为应用侧用户扩展表
-- - 时间统一使用 timestamptz
-- - JSON 使用 jsonb，便于索引与演进
-- - artifacts 仅存路径/元数据，实际文件放 Supabase Storage

-- =============================
-- Extensions
-- =============================
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- =============================
-- Enum Types
-- =============================
create type run_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'early-stopped',
  'canceled'
);

-- =============================
-- Users / Profiles
-- =============================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_updated_at on public.profiles(updated_at desc);

-- =============================
-- Strategies
-- 用户的策略注册信息与元数据，不直接存源码（源码可存 Storage/私有仓库）
-- entry_file 可指向存储中的入口脚本路径；requirements 记录 pip 依赖
-- =============================
create table if not exists public.strategies (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  tags text[] default '{}',
  description text,
  entry_file text, -- e.g. storage path like 'strategies/{user}/{strategy}/main.py'
  requirements text, -- plain text of requirements or a pointer to file path
  version_ts timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_strategies_owner on public.strategies(owner_id);
create index if not exists idx_strategies_updated_at on public.strategies(updated_at desc);

-- =============================
-- Strategy Versions
-- 策略版本/提交记录，引用源代码与依赖快照
-- =============================
create table if not exists public.strategy_versions (
  id uuid primary key default uuid_generate_v4(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  code_ref text,             -- 可指向 Supabase Storage 或 Git commit
  requirements text[],       -- 依赖列表（可选）
  metadata jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_strategy_versions_strategy on public.strategy_versions(strategy_id);
create index if not exists idx_strategy_versions_owner on public.strategy_versions(owner_id);

-- =============================
-- Backtests
-- 一次“实验”的容器，可包含多次 run（参数不同）
-- context 描述数据频率/标的集合/窗口等
-- =============================
create table if not exists public.backtests (
  id uuid primary key default uuid_generate_v4(),
  strategy_id uuid not null references public.strategies(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  context jsonb not null, -- {universe, frequency, window, datasource_version}
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_backtests_owner on public.backtests(owner_id);
create index if not exists idx_backtests_strategy on public.backtests(strategy_id);

-- =============================
-- Backtest Runs
-- 具体一次运行记录，携带参数、状态、产物/统计
-- artifacts 记录对象存储路径，stats 为聚合指标
-- =============================
create table if not exists public.backtest_runs (
  id uuid primary key default uuid_generate_v4(),
  backtest_id uuid not null references public.backtests(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  strategy_version_id uuid references public.strategy_versions(id),
  status run_status not null default 'queued',
  params jsonb not null,          -- 参数字典
  budget_ms int,                  -- 预算时间（毫秒）
  started_at timestamptz,
  finished_at timestamptz,
  progress int default 0,         -- 0-100 进度
  stats jsonb,                    -- {pnl, return, max_dd, sharpe?, sortino?}
  artifacts jsonb,                -- {equity_curve_path, trades_path, logs_path}
  error text,                     -- 失败原因
  created_at timestamptz not null default now()
);
create index if not exists idx_runs_backtest on public.backtest_runs(backtest_id);
create index if not exists idx_runs_owner on public.backtest_runs(owner_id);
create index if not exists idx_runs_status on public.backtest_runs(status);
create index if not exists idx_runs_started_at on public.backtest_runs(started_at);

-- =============================
-- Metrics (optional, fine-grained)
-- 如果需要将指标拆到明细表，便于聚合/对比
-- =============================
create table if not exists public.metrics (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.backtest_runs(id) on delete cascade,
  key text not null,
  value numeric,
  extra jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_metrics_run on public.metrics(run_id);
create index if not exists idx_metrics_key on public.metrics(key);

-- =============================
-- Result Summaries
-- 回测/寻优共享的摘要指标存储，避免重复写大字段
-- =============================
create table if not exists public.result_summaries (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  source text,              -- backtest_run / optimization_task 等
  metrics jsonb not null,
  equity_curve_ref text,
  trades_ref text,
  artifacts jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_result_summaries_owner on public.result_summaries(owner_id);

-- =============================
-- Artifacts (optional, additional)
-- 如需对多类型产物做更结构化的索引
-- =============================
create table if not exists public.artifacts (
  id uuid primary key default uuid_generate_v4(),
  run_id uuid not null references public.backtest_runs(id) on delete cascade,
  type text not null,           -- equity|trades|logs|report|csv|png ...
  path text not null,           -- storage path
  bytes bigint,
  checksum text,
  meta jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_artifacts_run on public.artifacts(run_id);
create index if not exists idx_artifacts_type on public.artifacts(type);

-- =============================
-- Optimization Jobs & Tasks
-- 参数寻优父作业与子任务结构
-- =============================
create table if not exists public.optimization_jobs (
  id uuid primary key default uuid_generate_v4(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  strategy_version_id uuid not null references public.strategy_versions(id),
  param_space jsonb not null,
  concurrency_limit int not null default 2 check (concurrency_limit > 0 and concurrency_limit <= 64),
  early_stop_policy jsonb,
  status run_status not null default 'queued',
  total_tasks int,
  estimate int,
  summary jsonb,
  result_summary_id uuid references public.result_summaries(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opt_jobs_owner_created on public.optimization_jobs(owner_id, created_at desc);
create index if not exists idx_opt_jobs_version on public.optimization_jobs(strategy_version_id);

create table if not exists public.optimization_tasks (
  id uuid primary key default uuid_generate_v4(),
  job_id uuid not null references public.optimization_jobs(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  strategy_version_id uuid not null references public.strategy_versions(id),
  param_set jsonb not null,
  status run_status not null default 'queued',
  progress real,
  retries int not null default 0,
  error jsonb,
  result_summary_id uuid references public.result_summaries(id),
  score double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_opt_tasks_job on public.optimization_tasks(job_id);
create index if not exists idx_opt_tasks_owner on public.optimization_tasks(owner_id);

-- =============================
-- Helper Views (examples)
-- =============================
create or replace view public.v_run_brief as
select r.id as run_id,
       r.backtest_id,
       r.status,
       (r.stats->>'return')::numeric as annual_return,
       (r.stats->>'max_dd')::numeric as max_drawdown,
       (r.stats->>'sharpe')::numeric as sharpe,
       r.created_at,
       r.started_at,
       r.finished_at
from public.backtest_runs r;

-- =============================
-- Row Level Security (optional for Supabase)
-- 开启 RLS 并提供最小策略示例（仅资源 owner 可读写）
-- =============================
alter table public.profiles enable row level security;
alter table public.strategies enable row level security;
alter table public.backtests enable row level security;
alter table public.backtest_runs enable row level security;
alter table public.metrics enable row level security;
alter table public.artifacts enable row level security;
alter table public.strategy_versions enable row level security;
alter table public.result_summaries enable row level security;
alter table public.optimization_jobs enable row level security;
alter table public.optimization_tasks enable row level security;

drop policy if exists "profiles self access" on public.profiles;
create policy "profiles self access" on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists "strategies by owner" on public.strategies;
create policy "strategies by owner" on public.strategies
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "backtests by owner" on public.backtests;
create policy "backtests by owner" on public.backtests
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "runs by owner" on public.backtest_runs;
create policy "runs by owner" on public.backtest_runs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "metrics by owner" on public.metrics;
create policy "metrics by owner" on public.metrics
  for all using (run_id in (select id from public.backtest_runs where owner_id = auth.uid()))
  with check (run_id in (select id from public.backtest_runs where owner_id = auth.uid()));

drop policy if exists "artifacts by owner" on public.artifacts;
create policy "artifacts by owner" on public.artifacts
  for all using (run_id in (select id from public.backtest_runs where owner_id = auth.uid()))
  with check (run_id in (select id from public.backtest_runs where owner_id = auth.uid()));

drop policy if exists "strategy_versions by owner" on public.strategy_versions;
create policy "strategy_versions by owner" on public.strategy_versions
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "result_summaries by owner" on public.result_summaries;
create policy "result_summaries by owner" on public.result_summaries
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "optimization_jobs by owner" on public.optimization_jobs;
create policy "optimization_jobs by owner" on public.optimization_jobs
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "optimization_tasks by owner" on public.optimization_tasks;
create policy "optimization_tasks by owner" on public.optimization_tasks
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- =============================
-- Seed Hints (optional)
-- =============================
-- insert into public.profiles (id, display_name) values ('00000000-0000-0000-0000-000000000000', '学不会的何同学');
-- insert into public.strategies (owner_id, name) values ('00000000-0000-0000-0000-000000000000', '均线交叉');

-- =============================
-- Storage buckets 与访问策略（Supabase Storage）
-- 建议：私有 buckets，仅 owner 可读写；分享走签名 URL
-- =============================
-- 创建 buckets（幂等：已存在则吞异常）
do $$ begin
  perform storage.create_bucket('strategies', false);
exception when others then
  -- ignore if exists
  null;
end $$;

do $$ begin
  perform storage.create_bucket('artifacts', false);
exception when others then
  -- ignore if exists
  null;
end $$;

-- RLS 策略：storage.objects 表
-- 说明：owner 列由 Supabase 填充为 auth.uid()；此处按 bucket_id + owner 双重限制
create or replace function public._ensure_storage_rls() returns void language plpgsql as $$
begin
  -- storage.objects 策略：先删再建，避免重复错误
  execute 'drop policy if exists "strategies objects read own" on storage.objects';
  execute 'create policy "strategies objects read own" on storage.objects for select using (bucket_id = ''strategies'' and owner = auth.uid())';
  execute 'drop policy if exists "strategies objects write own" on storage.objects';
  execute 'create policy "strategies objects write own" on storage.objects for insert with check (bucket_id = ''strategies'' and owner = auth.uid())';
  execute 'drop policy if exists "strategies objects update own" on storage.objects';
  execute 'create policy "strategies objects update own" on storage.objects for update using (bucket_id = ''strategies'' and owner = auth.uid()) with check (bucket_id = ''strategies'' and owner = auth.uid())';
  execute 'drop policy if exists "strategies objects delete own" on storage.objects';
  execute 'create policy "strategies objects delete own" on storage.objects for delete using (bucket_id = ''strategies'' and owner = auth.uid())';

  execute 'drop policy if exists "artifacts objects read own" on storage.objects';
  execute 'create policy "artifacts objects read own" on storage.objects for select using (bucket_id = ''artifacts'' and owner = auth.uid())';
  execute 'drop policy if exists "artifacts objects write own" on storage.objects';
  execute 'create policy "artifacts objects write own" on storage.objects for insert with check (bucket_id = ''artifacts'' and owner = auth.uid())';
  execute 'drop policy if exists "artifacts objects update own" on storage.objects';
  execute 'create policy "artifacts objects update own" on storage.objects for update using (bucket_id = ''artifacts'' and owner = auth.uid()) with check (bucket_id = ''artifacts'' and owner = auth.uid())';
  execute 'drop policy if exists "artifacts objects delete own" on storage.objects';
  execute 'create policy "artifacts objects delete own" on storage.objects for delete using (bucket_id = ''artifacts'' and owner = auth.uid())';
end;$$;

select public._ensure_storage_rls();
