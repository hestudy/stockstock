"use client";

import type { StrategyDraft } from "@shared/strategy";

export function saveDraft(key: string, draft: StrategyDraft) {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (_e) {
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

export type SubmitPayload = {
  versionId: string;
  params: Record<string, any>;
  metadata: StrategyDraft["metadata"];
  requirements: StrategyDraft["requirements"];
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isRecord(v: unknown): v is Record<string, any> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

// 与现有单测兼容的请求类型与占位 submitBacktest（后续故事切换到 services/backtests.ts 实现）
export type BacktestSubmitRequest = {
  versionId: string;
  draft: StrategyDraft;
};

export async function submitBacktest(_req: BacktestSubmitRequest): Promise<{ ok: boolean }> {
  await new Promise((r) => setTimeout(r, 50));
  return { ok: true };
}

// 重载：既支持 (req) 也支持 (draft, versionId)
export function buildSubmitPayload(req: BacktestSubmitRequest): SubmitPayload;
export function buildSubmitPayload(draft: StrategyDraft, versionId: string): SubmitPayload;
export function buildSubmitPayload(
  a: StrategyDraft | BacktestSubmitRequest,
  b?: string,
): SubmitPayload {
  let draft: StrategyDraft;
  let versionId: string;
  if (typeof b === "string") {
    draft = a as StrategyDraft;
    versionId = b;
  } else {
    const req = a as BacktestSubmitRequest;
    draft = req?.draft as StrategyDraft;
    versionId = req?.versionId as string;
  }
  if (!isNonEmptyString(versionId)) {
    throw new Error("versionId 无效");
  }
  const params = (draft as StrategyDraft)?.source?.params;
  if (!isRecord(params)) {
    throw new Error("params 结构无效");
  }
  return {
    versionId,
    params,
    metadata: draft.metadata,
    requirements: draft.requirements,
  };
}
