"use client";

import type { StrategyDraft } from "@stockstock/shared/src/strategy";

export function saveDraft(key: string, draft: StrategyDraft) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (e) {
    // no-op: localStorage 可能不可用
  }
}

export function loadDraft(key: string): StrategyDraft | null {
  try {
    if (typeof window === "undefined") return null;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as StrategyDraft;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(key);
  } catch {
    // no-op
  }
}

export type BacktestSubmitRequest = {
  versionId: string;
  draft: StrategyDraft;
};

export async function submitBacktest(_req: BacktestSubmitRequest): Promise<{ ok: boolean }>
{
  // 本故事占位：仅返回 mock 结果；后续 1.3 接入实际 API
  await new Promise(r => setTimeout(r, 200));
  return { ok: true };
}
