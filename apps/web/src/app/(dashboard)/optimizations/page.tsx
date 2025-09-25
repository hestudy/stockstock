"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { OptimizationSubmitRequest } from "@shared/index";
import { submitOptimization } from "../../../services/optimizations";
import { jobsStore } from "../../../services/jobsStore";
import { mapErrorToMessage } from "../../../utils/errorMapping";

const DEFAULT_PARAM_SPACE = `{
  "ma_short": [5, 10],
  "ma_long": { "start": 50, "end": 60, "step": 5 }
}`;

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
  const redirectTimer = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (redirectTimer.current !== null) {
        window.clearTimeout(redirectTimer.current);
      }
    };
  }, []);

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
    </main>
  );
}
