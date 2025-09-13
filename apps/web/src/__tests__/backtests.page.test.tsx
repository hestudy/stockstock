/* @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";

// Mocks
vi.mock("next/navigation", () => {
  const push = vi.fn();
  return {
    useRouter: () => ({ push, replace: vi.fn(), prefetch: vi.fn() }),
  };
});

vi.mock("../services/strategies", () => {
  return {
    loadDraft: () => ({
      metadata: {
        name: "t",
        tags: [],
        description: "",
        versionTimestamp: new Date().toISOString(),
      },
      requirements: { packages: [] },
      source: { language: "python", content: "print()", params: { a: 1 } },
    }),
    buildSubmitPayload: (draft: any, versionId: string) => ({
      versionId,
      params: draft.source.params,
    }),
  };
});

vi.mock("../services/backtests", () => {
  return {
    submitBacktest: vi.fn().mockResolvedValue({ id: "job-xyz", status: "queued" }),
  };
});

// Import after mocks
import BacktestsPage from "../app/(dashboard)/backtests/page";

describe("(dashboard)/backtests/page submit button", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders and can be server-rendered (basic smoke)", () => {
    const html = ReactDOMServer.renderToString(React.createElement(BacktestsPage));
    expect(html).toContain("策略编辑器");
  });

  it("SSR includes a11y attributes aria-disabled and aria-live=polite", () => {
    const html = ReactDOMServer.renderToString(React.createElement(BacktestsPage));
    // 按组件实现，初始 submitting=false，应包含 aria-disabled="false"
    expect(html).toContain('aria-disabled="false"');
    // 页面包含用于提示信息的 live region
    expect(html).toContain('aria-live="polite"');
  });
});
