/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { mapErrorToMessage } from "../app/(dashboard)/backtests/page";

describe("mapErrorToMessage", () => {
  it("maps 429/rate limited to friendly message", () => {
    expect(mapErrorToMessage("HTTP 429 Too Many Requests")).toContain("请求过于频繁");
    expect(mapErrorToMessage("rate limited by gateway")).toContain("请求过于频繁");
    expect(mapErrorToMessage("Too many attempts")).toContain("请求过于频繁");
  });

  it("maps timeout to timeout message", () => {
    expect(mapErrorToMessage("Request timed out after 5s")).toContain("请求超时");
    expect(mapErrorToMessage("Timeout awaiting 'fetch' for 10000ms"))
      .toContain("请求超时");
  });

  it("returns default for other errors and preserves text when available", () => {
    expect(mapErrorToMessage("unknown error")).toBe("unknown error");
    expect(mapErrorToMessage("")).toBe("出现了一点问题，请稍后再试。");
  });
});
