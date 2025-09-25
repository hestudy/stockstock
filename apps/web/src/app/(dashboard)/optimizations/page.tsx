"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { OptimizationJob, OptimizationSubmitRequest } from "@shared/index";
import { submitOptimization, fetchOptimizationHistory } from "../../../services/optimizations";
import { jobsStore } from "../../../services/jobsStore";
import { mapErrorToMessage } from "../../../utils/errorMapping";

const DEFAULT_PARAM_SPACE = `{
  "ma_short": [5, 10],
  "ma_long": { "start": 50, "end": 60, "step": 5 }
}`;

const HISTORY_PAGE_SIZE = 20;

export default function OptimizationsPage() {
  const router = useRouter();
  const [versionId, setVersionId] = React.useState("");
  const [paramSpace, setParamSpace] = React.useState(DEFAULT_PARAM_SPACE);
  const [concurrency, setConcurrency] = React.useState("2");
  const [earlyMetric, setEarlyMetric] = React.useState("");
  const [earlyThreshold, setEarlyThreshold] = React.useState("");
  const [earlyMode, setEarlyMode] = React.useState<"min" | "max">("min");
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRawError, setLastRawError] = React.useState<string | null>(null);
  const historyRequestId = React.useRef(0);
  const [history, setHistory] = React.useState<OptimizationJob[]>([]);
  const [historyLoading, setHistoryLoading] = React.useState(true);
  const [historyError, setHistoryError] = React.useState<string | null>(null);
  const [highlightJobId, setHighlightJobId] = React.useState<string | null>(null);
  const redirectTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

  const fetchHistory = React.useCallback(
    async (options?: { silent?: boolean }) => {
      const requestId = historyRequestId.current + 1;
      historyRequestId.current = requestId;
      if (!options?.silent) {
        setHistoryLoading(true);
      }
      try {
        const jobs = await fetchOptimizationHistory(HISTORY_PAGE_SIZE);
        if (historyRequestId.current !== requestId) {
          return;
        }
        setHistory(jobs);
        setHistoryError(null);
      } catch (err) {
        if (historyRequestId.current !== requestId) {
          return;
        }
        setHistoryError(mapErrorToMessage(err));
      } finally {
        if (!options?.silent && historyRequestId.current === requestId) {
          setHistoryLoading(false);
        }
      }
    },
    [mapErrorToMessage],
  );

  React.useEffect(() => {
    fetchHistory().catch(() => {
      // 错误会在 historyError 中展示
    });
  }, [fetchHistory]);

  React.useEffect(() => {
    const unsubscribe = jobsStore.subscribe((state) => {
      if (!state.lastSubmittedId) {
        return;
      }
      setHighlightJobId(state.lastSubmittedId);
      fetchHistory({ silent: true }).catch(() => {
        // 已在 fetchHistory 内处理错误
      });
    });
    return () => unsubscribe();
  }, [fetchHistory]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError(null);
    setLastRawError(null);
    setMessage(null);

    try {
      const trimmedVersion = versionId.trim();
      if (!trimmedVersion) {
        setError("请填写版本 ID");
        return;
      }

      let parsedParamSpace: Record<string, unknown>;
      try {
        parsedParamSpace = JSON.parse(paramSpace);
      } catch (err) {
        setError("参数空间必须是合法的 JSON 对象");
        setLastRawError(err instanceof Error ? err.message : String(err));
        return;
      }

      if (
        typeof parsedParamSpace !== "object" ||
        parsedParamSpace === null ||
        Array.isArray(parsedParamSpace)
      ) {
        setError("参数空间必须是对象形式（key/value）");
        return;
      }

      let parsedConcurrency: number | undefined;
      const trimmedConcurrency = concurrency.trim();
      if (trimmedConcurrency) {
        const num = Number(trimmedConcurrency);
        if (!Number.isInteger(num) || num <= 0) {
          setError("并发上限必须为正整数");
          return;
        }
        parsedConcurrency = num;
      }

      const hasEarlyInputs = earlyMetric.trim() || earlyThreshold.trim();
      if (hasEarlyInputs && (!earlyMetric.trim() || !earlyThreshold.trim())) {
        setError("早停策略需同时填写指标与阈值");
        return;
      }

      let earlyStopPolicy: OptimizationSubmitRequest["earlyStopPolicy"] | undefined;
      if (earlyMetric.trim()) {
        const threshold = Number(earlyThreshold.trim());
        if (!Number.isFinite(threshold)) {
          setError("早停阈值需为数字");
          return;
        }
        earlyStopPolicy = {
          metric: earlyMetric.trim(),
          threshold,
          mode: earlyMode,
        };
      }

      const payload: OptimizationSubmitRequest = {
        versionId: trimmedVersion,
        paramSpace: parsedParamSpace,
      };
      if (parsedConcurrency !== undefined) {
        payload.concurrencyLimit = parsedConcurrency;
      }
      if (earlyStopPolicy) {
        payload.earlyStopPolicy = earlyStopPolicy;
      }

      const response = await submitOptimization(payload);
      try {
        jobsStore.recordSubmission(response.id, response.sourceJobId ?? null);
      } catch {}
      setMessage("提交成功，正在跳转...");
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
      redirectTimer.current = window.setTimeout(() => {
        router.push(`/optimizations/${response.id}`);
      }, 100);
    } catch (err: unknown) {
      const friendly = mapErrorToMessage(err);
      setError(friendly);
      if (err instanceof Error) {
        setLastRawError(err.message);
      } else {
        try {
          setLastRawError(JSON.stringify(err));
        } catch {
          setLastRawError(String(err));
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="p-4 space-y-4" data-testid="optimizations-page">
      <header className="space-y-1">
        <h1 className="text-lg font-semibold">参数寻优提交</h1>
        <p className="text-sm text-gray-600 dark:text-slate-300">
          填写回测版本与参数空间，系统将创建父作业并并发地展开组合。
        </p>
      </header>

      <form className="space-y-4" onSubmit={handleSubmit} data-testid="optimizations-form">
        <div className="flex flex-col gap-1">
          <label htmlFor="versionId" className="font-medium text-sm">
            版本 ID
          </label>
          <input
            id="versionId"
            data-testid="optimizations-version"
            className="border rounded px-2 py-1"
            placeholder="例如：ver-20240901"
            value={versionId}
            onChange={(e) => setVersionId(e.target.value)}
            disabled={submitting}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="paramSpace" className="font-medium text-sm">
            参数空间（JSON）
          </label>
          <textarea
            id="paramSpace"
            data-testid="optimizations-param-space"
            className="border rounded px-2 py-2 font-mono text-sm"
            rows={6}
            value={paramSpace}
            onChange={(e) => setParamSpace(e.target.value)}
            disabled={submitting}
          />
          <p className="text-xs text-gray-500">
            支持数组或范围对象（如 {"{ \"start\": 1, \"end\": 5, \"step\": 1 }"}）。
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4" data-testid="optimizations-advanced">
          <div className="flex flex-col gap-1">
            <label htmlFor="concurrency" className="font-medium text-sm">
              并发上限
            </label>
            <input
              id="concurrency"
              data-testid="optimizations-concurrency"
              className="border rounded px-2 py-1"
              placeholder="默认 2"
              value={concurrency}
              onChange={(e) => setConcurrency(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="earlyMetric" className="font-medium text-sm">
              早停指标
            </label>
            <input
              id="earlyMetric"
              data-testid="optimizations-early-metric"
              className="border rounded px-2 py-1"
              placeholder="如：sharpe"
              value={earlyMetric}
              onChange={(e) => setEarlyMetric(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label htmlFor="earlyThreshold" className="font-medium text-sm">
              早停阈值
            </label>
            <input
              id="earlyThreshold"
              data-testid="optimizations-early-threshold"
              className="border rounded px-2 py-1"
              placeholder="数字，例如 1.2"
              value={earlyThreshold}
              onChange={(e) => setEarlyThreshold(e.target.value)}
              disabled={submitting}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1 md:w-40">
          <label htmlFor="earlyMode" className="font-medium text-sm">
            早停模式
          </label>
          <select
            id="earlyMode"
            data-testid="optimizations-early-mode"
            className="border rounded px-2 py-1"
            value={earlyMode}
            onChange={(e) => setEarlyMode(e.target.value as "min" | "max")}
            disabled={submitting}
          >
            <option value="min">min</option>
            <option value="max">max</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="submit"
            data-testid="optimizations-submit"
            className="px-4 py-2 border rounded disabled:opacity-50"
            disabled={submitting}
          >
            {submitting ? "提交中..." : "提交寻优"}
          </button>
        <div
          aria-live="polite"
          data-testid="optimizations-success"
          className="text-sm text-gray-600 dark:text-slate-300"
        >
            {message ?? ""}
          </div>
        </div>

        {error && (
          <div
            role="alert"
            data-testid="optimizations-error"
            className="text-sm text-red-600 border border-red-200 bg-red-50 dark:text-red-400 dark:border-red-500 dark:bg-red-900/20 px-3 py-2 rounded"
          >
            {error}
            {lastRawError && (
              <span className="block text-xs text-red-500 mt-1">{lastRawError}</span>
            )}
          </div>
        )}
      </form>

      <section className="space-y-3" data-testid="optimizations-history">
        <header className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">历史作业</h2>
          <div className="flex items-center gap-2 text-xs text-gray-500">
            {historyLoading && <span data-testid="optimizations-history-loading">加载中…</span>}
            <button
              type="button"
              data-testid="optimizations-history-refresh"
              onClick={() => {
                fetchHistory().catch(() => {
                  // 错误在 historyError 中展示
                });
              }}
              className="text-blue-600 hover:underline disabled:opacity-50"
              disabled={historyLoading}
            >
              刷新
            </button>
          </div>
        </header>

        {historyError && (
          <div
            role="alert"
            data-testid="optimizations-history-error"
            className="text-sm text-red-600"
          >
            {historyError}
          </div>
        )}

        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 dark:bg-slate-800/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">作业 ID</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">进度</th>
                <th className="px-3 py-2 font-medium">更新时间</th>
                <th className="px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {historyLoading && history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    正在加载历史记录…
                  </td>
                </tr>
              ) : history.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-gray-500">
                    暂无历史作业
                  </td>
                </tr>
              ) : (
                history.map((job) => {
                  const summary = job.summary ?? { total: 0, finished: 0, running: 0, throttled: 0, topN: [] };
                  const isHighlight = job.id === highlightJobId;
                  return (
                    <tr
                      key={job.id}
                      data-testid={`optimizations-history-row-${job.id}`}
                      className={`border-t border-gray-100 dark:border-slate-800 ${
                        isHighlight ? "bg-emerald-50 dark:bg-emerald-500/10" : ""
                      }`}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-mono text-sm">{job.id}</div>
                        {job.sourceJobId && (
                          <div className="text-xs text-gray-500 dark:text-slate-400">
                            来源：{job.sourceJobId}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <span>{translateJobStatus(job.status)}</span>
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatHistoryProgress(summary)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        {formatHistoryTimestamp(job.updatedAt)}
                      </td>
                      <td className="px-3 py-2 align-top">
                        <button
                          type="button"
                          className="text-blue-600 hover:underline"
                          onClick={() => router.push(`/optimizations/${job.id}`)}
                        >
                          查看详情
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function translateJobStatus(status: string): string {
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

function formatHistoryTimestamp(value?: string): string {
  if (!value) return "--";
  const time = Number.isNaN(Date.parse(value)) ? null : new Date(value);
  if (!time) return value;
  try {
    return time.toLocaleString();
  } catch {
    return value;
  }
}

function formatHistoryProgress(summary: OptimizationJob["summary"]): string {
  const finished = summary?.finished ?? 0;
  const total = summary?.total ?? 0;
  if (total <= 0) {
    return `${finished}`;
  }
  return `${finished}/${total}`;
}
