// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import ReactDOMServer from "react-dom/server";

// Mock next/navigation hooks used by the login page
vi.mock("next/navigation", () => {
  const sp = new URLSearchParams();
  // default reason can be overridden per-test
  sp.set("reason", "unauthenticated");
  return {
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
    useSearchParams: () => ({ get: (k: string) => sp.get(k) }),
  };
});

// Mock Supabase browser client used by the login page
vi.mock("../services/supabaseClient", () => {
  return {
    getSupabaseBrowserClient: () => ({
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({ data: {}, error: null }),
        signUp: vi.fn().mockResolvedValue({ data: {}, error: null }),
      },
    }),
  };
});

// Import after mocks so the component picks up mocked modules
import LoginPage from "../app/login/page";
import { getFriendlyMessage } from "../services/errors";

describe("<LoginPage /> reason banner", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("renders friendly banner when reason=unauthenticated (AC4 UI)", async () => {
    const html = ReactDOMServer.renderToString(React.createElement(LoginPage));
    // Should include friendly message from errors service
    expect(html).toContain(getFriendlyMessage("unauthenticated")!);
  });

  it("renders default friendly message for unknown reason (AC4 UI)", async () => {
    // Remock next/navigation with unknown reason
    vi.doMock("next/navigation", () => {
      const sp = new URLSearchParams();
      sp.set("reason", "something-else");
      return {
        useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
        useSearchParams: () => ({ get: (k: string) => sp.get(k) }),
      };
    });
    const { default: LP } = await import("../app/login/page");
    const html = ReactDOMServer.renderToString(React.createElement(LP));
    expect(html).toContain(getFriendlyMessage("unknown")!);
  });
});
