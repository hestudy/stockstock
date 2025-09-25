"use client";

import React from "react";
import type { OptimizationStatus } from "@shared/index";
import {
  fetchOptimizationStatus,
  cancelOptimization,
} from "../../../../services/optimizations";
import { mapErrorToMessage } from "../../../../utils/errorMapping";

const REFRESH_INTERVAL_MS = 5000;

type PageProps = {
  params: { id: string };
};

export default function OptimizationDetailPage({ params }: PageProps) {
  return <OptimizationStatusView jobId={params.id} />;
}

function OptimizationStatusView({ jobId }: { jobId: string }) {
  const [status, setStatus] = React.useState<OptimizationStatus | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [canceling, setCanceling] = React.useState(false);

  const loadStatus = React.useCallback(async () => {
    try {
      const next = await fetchOptimizationStatus(jobId);
      setStatus(next);
      setError(null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(mapErrorToMessage(err));
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStatus();
    })();
    const timer = window.setInterval(() => {
      if (!cancelled) {
        loadStatus();
      }
    }, REFRESH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [loadStatus]);

  const throttled = Boolean(
    status?.diagnostics.throttled || (status?.summary?.throttled ?? 0) > 0,
  );
  const topN = status?.summary?.topN ?? [];
  const topNSortingNote = describeTopNSorting(topN);
  const isFinal = React.useMemo(() => {
    if (!status) return false;
    if (status.diagnostics?.final) return true;
    return ["succeeded", "failed", "early-stopped", "canceled"].includes(
      status.status,
    );
  }, [status]);

  const handleCancel = React.useCallback(async () => {
    if (canceling || isFinal) {
      return;
    }
    setCanceling(true);
    setNotice(null);
    try {
      const nextStatus = await cancelOptimization(jobId);
      setStatus(nextStatus);
      setError(null);
      setNotice("已发起取消请求，状态已刷新。");
      setLastUpdated(new Date());
    } catch (err) {
      setError(mapErrorToMessage(err));
    } finally {
      setCanceling(false);
    }
  }, [canceling, isFinal, jobId]);

  return (
    <main className="p-4 space-y-6" data-testid="optimizations-detail">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">寻优作业详情</h1>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          作业 ID：
          <span data-testid="optimizations-job-id" className="font-mono">
            {jobId}
          </span>
        </p>
        {lastUpdated && (
          <p className="text-xs text-gray-400">
            上次刷新：{formatTimestamp(lastUpdated)}
          </p>
        )}
      </header>

      <section
        className="flex flex-wrap items-center gap-3"
        data-testid="optimizations-actions"
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              loadStatus();
            }}
            className="px-3 py-1 border rounded disabled:opacity-50"
            disabled={loading}
          >
            {loading ? "加载中..." : "立即刷新"}
          </button>
          <button
            type="button"
            data-testid="optimizations-cancel"
            onClick={handleCancel}
            className="px-3 py-1 border border-red-500 text-red-600 rounded hover:bg-red-50 disabled:opacity-50"
            disabled={canceling || isFinal}
          >
            {canceling ? "取消中..." : "取消作业"}
          </button>
        </div>
        {notice && (
          <span
            data-testid="optimizations-detail-notice"
            className="text-sm text-emerald-600"
          >
            {notice}
          </span>
        )}
        {error && (
          <span
            role="alert"
            data-testid="optimizations-detail-error"
            className="text-sm text-red-600"
          >
            {error}
          </span>
        )}
      </section>

      {status && (
        <section
          className="grid gap-4 md:grid-cols-2 lg:grid-cols-4"
          data-testid="optimizations-summary"
        >
          {renderMetric("状态", translateStatus(status.status))}
          {renderMetric("总任务", status.summary.total)}
          {renderMetric("进行中", status.summary.running)}
          {renderMetric("已完成", status.summary.finished)}
          {renderMetric("排队节流", status.summary.throttled)}
          {renderMetric("并发上限", status.concurrencyLimit)}
          {renderMetric("当前队列", status.diagnostics.queueDepth)}
          {renderMetric("活跃任务", status.diagnostics.running)}
        </section>
      )}

      {throttled && (
        <section
          data-testid="optimizations-throttle-banner"
          className="border border-amber-200 bg-amber-50 dark:border-amber-500/50 dark:bg-amber-500/10 px-4 py-3 rounded"
        >
          <h2 className="font-semibold text-amber-800 dark:text-amber-200">
            节流中
          </h2>
          <p className="text-sm text-amber-700 dark:text-amber-100">
            当前有部分子任务处于排队或退避状态，系统正按并发上限调度。
            若持续超过预期，请检查参数空间或调整并发限制。
          </p>
        </section>
      )}

      <section className="space-y-3">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Top-N 子任务</h2>
          <span className="text-xs text-gray-500">{topNSortingNote}</span>
        </header>
        <div className="overflow-x-auto border rounded" data-testid="optimizations-topn">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">排名</th>
                <th className="px-3 py-2 font-medium">任务 ID</th>
                <th className="px-3 py-2 font-medium">得分</th>
              </tr>
            </thead>
            <tbody>
              {topN.length === 0 && (
                <tr>
                  <td
                    colSpan={3}
                    className="px-3 py-6 text-center text-gray-500"
                  >
                    暂无完成的子任务结果
                  </td>
                </tr>
              )}
              {topN.map((entry, index) => (
                <tr
                  key={entry.taskId}
                  className="border-t border-gray-100 dark:border-slate-800"
                >
                  <td className="px-3 py-2 font-medium">#{index + 1}</td>
                  <td className="px-3 py-2 font-mono text-sm">{entry.taskId}</td>
                  <td className="px-3 py-2">{formatScore(entry.score)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function renderMetric(label: string, value: React.ReactNode) {
  return (
    <div className="border rounded px-3 py-2 bg-white shadow-sm dark:bg-slate-900/60">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-lg font-semibold" data-testid={`metric-${label}`}>
        {value}
      </p>
    </div>
  );
}

function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined) {
    return "-";
  }
  return score.toFixed(4);
}

function formatTimestamp(value: Date): string {
  return value.toLocaleString();
}

function translateStatus(status: string): string {
  const mapping: Record<string, string> = {
    queued: "排队中",
    running: "执行中",
    succeeded: "已完成",
    failed: "失败",
    "early-stopped": "提前停止",
    canceled: "已取消",
  };
  return mapping[status] ?? status;
}

export function describeTopNSorting(topN: OptimizationStatus["summary"]["topN"]): string {
  if (!Array.isArray(topN) || topN.length < 2) {
    return "根据得分排序展示，实时刷新";
  }
  const first = topN[0]?.score;
  const last = topN[topN.length - 1]?.score;
  if (typeof first === "number" && typeof last === "number") {
    if (first > last) {
      return "根据得分降序展示，实时刷新";
    }
    if (first < last) {
      return "根据得分升序展示，实时刷新";
    }
  }
  return "根据得分排序展示，实时刷新";
}
