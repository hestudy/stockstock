"use client";

import type { StrategyDraft } from "@shared/strategy";

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

// 为 QA 端到端/集成校验提供的辅助：从当前占位请求结构生成后续实际提交所需的 payload
export type SubmitPayload = {
  versionId: string;
  params: Record<string, any>;
  metadata: StrategyDraft["metadata"];
  requirements: StrategyDraft["requirements"];
};

export function buildSubmitPayload(req: BacktestSubmitRequest): SubmitPayload {
  return {
    versionId: req.versionId,
    params: req.draft.source.params,
    metadata: req.draft.metadata,
    requirements: req.draft.requirements,
  };
}
