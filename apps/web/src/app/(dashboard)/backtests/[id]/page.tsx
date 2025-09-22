"use client";

import React from "react";
import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { getBacktestStatus, getBacktestResult } from "../../../../services/backtests";
import type { ResultSummary, BacktestStatusResponse } from "@shared/backtest";
import type { Props as EquityCurveProps } from "../../../../components/charts/EquityCurve";
import { mapErrorToMessage } from "../../../../utils/errorMapping";
import SummaryCards from "../../../../components/summary/SummaryCards";
import { observability } from "../../../../utils/observability";

const EquityCurve = dynamic<EquityCurveProps>(
  () => import("../../../../components/charts/EquityCurve"),
  {
    ssr: false,
    loading: () => <div className="text-sm text-gray-500">正在加载曲线组件…</div>,
  },
);

function usePolling(id: string) {
  const [status, setStatus] = React.useState<BacktestStatusResponse | null>(null);
  const [result, setResult] = React.useState<ResultSummary | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const stoppedRef = React.useRef(false);
  const startRef = React.useRef<number | null>(null);
  const reportedRef = React.useRef(false);

  React.useEffect(() => {
    let mounted = true;
    let timer: any;
    startRef.current = performance?.now?.() ?? Date.now();

    // 乐观尝试：如果结果已就绪，则尽快显示摘要，满足 2s 目标
    (async () => {
      try {
        const r = await getBacktestResult(id);
        if (mounted && r && r.metrics) {
          setResult(r);
          // 结果已就绪则可停止后续轮询
          stoppedRef.current = true;
        }
      } catch (_e) {
        // 静默失败，继续依赖状态轮询推进
      }
    })();

    async function tick() {
      try {
        const s = await getBacktestStatus(id);
        if (!mounted) return;
        setStatus(s);
        if (s.status === "failed") {
          setError("作业失败，请检查参数或稍后重试。");
          stoppedRef.current = true; // 失败后停止轮询
          return;
        }
        if (s.status === "succeeded" || (s as any).status === "completed") {
          const r = await getBacktestResult(id);
          if (!mounted) return;
          setResult(r);
          stoppedRef.current = true; // 成功后停止轮询
          return;
        }
      } catch (e: unknown) {
        if (!mounted) return;
        const err = e as { message?: string } | undefined;
        const raw = typeof err?.message === "string" ? err.message : "获取状态失败";
        setError(mapErrorToMessage(e) || raw);
      } finally {
        if (mounted && !stoppedRef.current) timer = setTimeout(tick, 1500);
      }
    }

    tick();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [id]);

  // 首次出现摘要时上报渲染耗时
  React.useEffect(() => {
    const hasSummary = !!result?.metrics && Object.keys(result.metrics).length > 0;
    if (hasSummary && !reportedRef.current) {
      const end = performance?.now?.() ?? Date.now();
      const start = startRef.current ?? end;
      const ms = Math.max(0, Math.round(end - start));
      observability.trackSummaryRendered(ms, { id });
      reportedRef.current = true;
    }
  }, [result, id]);

  // 错误变化时上报
  React.useEffect(() => {
    if (error) observability.trackError(error, { id });
  }, [error, id]);

  return { status, result, error };
}

export default function BacktestDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const { status, result, error } = usePolling(id);

  const hasSummary = !!result?.metrics && Object.keys(result.metrics).length > 0;

  return (
    <main className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">回测详情</h1>
        <button
          className="px-3 py-1 border rounded"
          onClick={() => router.push("/backtests")}
          aria-label="返回列表"
        >
          返回
        </button>
      </div>

      <section role="status" aria-live="polite" className="space-y-2">
        <div className="text-sm text-gray-600">
          状态：{status?.status ?? "加载中"}
          {typeof (status as any)?.progress === "number" && (
            <span className="ml-2">进度：{(status as any).progress}%</span>
          )}
        </div>
        {error && (
          <div className="text-sm text-red-600 flex items-center gap-2">
            <span>{error}</span>
            <button className="underline" onClick={() => location.reload()} aria-label="重试加载">
              重试
            </button>
            <button className="underline" onClick={() => router.push("/backtests")} aria-label="返回列表">
              返回列表
            </button>
          </div>
        )}
      </section>

      <section aria-live="polite" aria-label="结果摘要" role="status">
        <div data-testid="summary-cards">
          {!hasSummary ? (
            <div className="animate-pulse grid grid-cols-3 gap-3">
              <div className="h-16 bg-gray-200 rounded" />
              <div className="h-16 bg-gray-200 rounded" />
              <div className="h-16 bg-gray-200 rounded" />
            </div>
          ) : (
            <SummaryCards metrics={result!.metrics} id={id} />
          )}
        </div>
      </section>

      <section>
        <React.Suspense fallback={<div className="h-48 bg-gray-100 rounded" />}>
          <EquityCurve data={(result as any)?.equity ?? []} />
        </React.Suspense>
      </section>
    </main>
  );
}
