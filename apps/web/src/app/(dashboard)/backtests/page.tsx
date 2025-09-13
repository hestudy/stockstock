"use client";

import React from "react";
import StrategyEditor from "../../../components/forms/StrategyEditor";
import { loadDraft, buildSubmitPayload } from "../../../services/strategies";
import { submitBacktest } from "../../../services/backtests";
import { useRouter } from "next/navigation";
import { jobsStore } from "../../../services/jobsStore";

export function mapErrorToMessage(raw: string): string {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("429") || lower.includes("rate") || lower.includes("too many")) {
    return "请求过于频繁，请稍后重试。";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "请求超时，请检查网络后重试。";
  }
  return raw || "出现了一点问题，请稍后再试。";
}

export default function BacktestsPage() {
  const router = useRouter();
  const [submitting, setSubmitting] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [lastError, setLastError] = React.useState<string | null>(null);

  const STORAGE_KEY = "strategy-editor:draft"; // 与编辑器保持一致

  async function onSubmit() {
    try {
      setSubmitting(true);
      setMessage(null);
      setLastError(null);
      const draft = loadDraft(STORAGE_KEY);
      if (!draft) {
        setMessage("草稿为空，无法提交");
        return;
      }
      // 暂以版本时间戳作为 versionId（后续可替换为实际版本 ID 机制）
      const versionId = draft.metadata?.versionTimestamp ?? "";
      const payload = buildSubmitPayload(draft, versionId);
      const res = await submitBacktest(payload);
      // 写入最近提交的 job id，便于状态页/其他组件消费
      try {
        jobsStore.setLastSubmittedId(res.id);
      } catch {}
      setMessage("已提交，正在跳转...");
      // 跳转到状态/详情页（1.4 将继续完善）
      router.push(`/backtests/${res.id}`);
    } catch (e: any) {
      const raw = typeof e?.message === "string" ? e.message : "出现了一点问题，请稍后再试。";
      setLastError(raw);
      setMessage(mapErrorToMessage(raw));
    } finally {
      setSubmitting(false);
    }
  }

  const disabled = submitting; // 基础 gating，编辑器内具备更细校验

  return (
    <main className="p-4">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold">策略编辑器</h1>
        <button
          onClick={onSubmit}
          className="px-3 py-1 border rounded disabled:opacity-50"
          aria-disabled={disabled}
          disabled={disabled}
        >
          {submitting ? "提交中..." : "提交回测"}
        </button>
      </div>
      <div aria-live="polite" className="sr-only">
        {message ?? ""}
      </div>
      {message && (
        <div role="status" className="text-sm text-gray-600 dark:text-slate-300 mb-2">
          {message}
          {lastError && (
            <>
              {" "}
              <button
                type="button"
                onClick={onSubmit}
                className="inline-flex items-center px-2 py-0.5 ml-2 border rounded text-xs"
                aria-label="重试提交回测"
              >
                重试
              </button>
            </>
          )}
        </div>
      )}
      <StrategyEditor />
    </main>
  );
}
