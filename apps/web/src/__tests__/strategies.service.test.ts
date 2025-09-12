/* @vitest-environment jsdom */
import { describe, it, expect, beforeEach } from "vitest";
import { saveDraft, loadDraft, clearDraft, type BacktestSubmitRequest } from "../services/strategies";
import type { StrategyDraft } from "@shared/strategy";

const KEY = "strategy-editor:draft";

function makeDraft(): StrategyDraft {
  return {
    metadata: { name: "t", tags: ["a"], description: "d", versionTimestamp: new Date().toISOString() },
    requirements: { packages: [{ name: "vectorbt", version: ">=0.25" }] },
    source: { language: "python", content: "print('hi')", params: { a: 1 } },
  };
}

describe("strategies service (localStorage)", () => {
  beforeEach(() => {
    // 兜底：某些环境未提供 localStorage，则注入一个简单 mock
    if (typeof window !== "undefined" && !window.localStorage) {
      let store: Record<string, string> = {};
      // @ts-ignore
      window.localStorage = {
        getItem: (k: string) => (k in store ? store[k] : null),
        setItem: (k: string, v: string) => {
          store[k] = String(v);
        },
        removeItem: (k: string) => {
          delete store[k];
        },
        clear: () => {
          store = {};
        },
        key: (i: number) => Object.keys(store)[i] ?? null,
        get length() {
          return Object.keys(store).length;
        },
      } as unknown as Storage;
    }
    localStorage.clear();
  });

  it("saves and loads draft", () => {
    const draft = makeDraft();
    saveDraft(KEY, draft);
    const loaded = loadDraft(KEY);
    expect(loaded).toBeTruthy();
    expect(loaded?.metadata.name).toBe("t");
    expect(loaded?.source.content).toContain("print");
  });

  it("clears draft", () => {
    saveDraft(KEY, makeDraft());
    clearDraft(KEY);
    expect(loadDraft(KEY)).toBeNull();
  });

  it("submitBacktest mock returns ok", async () => {
    const draft = makeDraft();
    const req: BacktestSubmitRequest = { versionId: "uuid-placeholder", draft };
    const mod = await import("../services/strategies");
    const res = await mod.submitBacktest(req);
    expect(res.ok).toBe(true);
  });
});
