/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { mapErrorToMessage } from "../utils/errorMapping";
import { ApiClientError } from "../services/apiClient";

describe("mapErrorToMessage", () => {
  describe("Authentication errors (401)", () => {
    it("maps 401 to authentication message", () => {
      expect(mapErrorToMessage("HTTP 401 Unauthorized")).toContain("未登录或会话已过期");
      expect(mapErrorToMessage("unauthenticated")).toContain("未登录或会话已过期");
      expect(mapErrorToMessage("401")).toContain("未登录或会话已过期");
    });
  });

  describe("Authorization errors (403)", () => {
    it("maps 403 to authorization message", () => {
      expect(mapErrorToMessage("HTTP 403 Forbidden")).toContain("无权限访问");
      expect(mapErrorToMessage("forbidden")).toContain("无权限访问");
      expect(mapErrorToMessage("403")).toContain("无权限访问");
    });
  });

  describe("Not Found errors (404)", () => {
    it("maps 404 to not found message", () => {
      expect(mapErrorToMessage("HTTP 404 Not Found")).toContain("资源不存在或已被删除");
      expect(mapErrorToMessage("not found")).toContain("资源不存在或已被删除");
      expect(mapErrorToMessage("404")).toContain("资源不存在或已被删除");
    });
  });

  describe("Validation errors (400/422)", () => {
    it("maps validation errors to parameter message", () => {
      expect(mapErrorToMessage("HTTP 400 Bad Request")).toContain("参数不合法");
      expect(mapErrorToMessage("HTTP 422 Unprocessable Entity")).toContain("参数不合法");
      expect(mapErrorToMessage("validation failed")).toContain("参数不合法");
      expect(mapErrorToMessage("invalid_id")).toContain("参数不合法");
      expect(mapErrorToMessage("invalid id")).toContain("参数不合法");
    });
  });

  describe("Rate limiting errors (429)", () => {
    it("maps 429/rate limited to friendly message", () => {
      expect(mapErrorToMessage("HTTP 429 Too Many Requests")).toContain("请求过于频繁");
      expect(mapErrorToMessage("rate limited by gateway")).toContain("请求过于频繁");
      expect(mapErrorToMessage("Too many attempts")).toContain("请求过于频繁");
      expect(mapErrorToMessage("rate_limited")).toContain("请求过于频繁");
      expect(mapErrorToMessage("429")).toContain("请求过于频繁");
    });
  });

  describe("Timeout errors (408, excluding 504)", () => {
    it("maps timeout to timeout message", () => {
      expect(mapErrorToMessage("Request timed out after 5s")).toContain("请求超时");
      expect(mapErrorToMessage("Timeout awaiting 'fetch' for 10000ms")).toContain("请求超时");
      expect(mapErrorToMessage("HTTP 408 Request Timeout")).toContain("请求超时");
      expect(mapErrorToMessage("408")).toContain("请求超时");
    });

    it("does not map 504 gateway timeout to timeout message", () => {
      expect(mapErrorToMessage("HTTP 504 Gateway Timeout")).toContain("服务暂不可用");
      expect(mapErrorToMessage("gateway timeout")).toContain("服务暂不可用");
    });
  });

  describe("Network errors", () => {
    it("maps network errors to network message", () => {
      expect(mapErrorToMessage("network error")).toContain("网络异常");
      expect(mapErrorToMessage("failed to fetch")).toContain("网络异常");
      expect(mapErrorToMessage("fetch failed")).toContain("网络异常");
      expect(mapErrorToMessage("ECONNRESET")).toContain("网络异常");
      expect(mapErrorToMessage("ENETUNREACH")).toContain("网络异常");
      expect(mapErrorToMessage("EHOSTUNREACH")).toContain("网络异常");
    });
  });

  describe("Server errors (5xx)", () => {
    it("maps 5xx errors to service unavailable message", () => {
      expect(mapErrorToMessage("HTTP 500 Internal Server Error")).toContain("服务暂不可用");
      expect(mapErrorToMessage("HTTP 502 Bad Gateway")).toContain("服务暂不可用");
      expect(mapErrorToMessage("HTTP 503 Service Unavailable")).toContain("服务暂不可用");
      expect(mapErrorToMessage("HTTP 504 Gateway Timeout")).toContain("服务暂不可用");
      expect(mapErrorToMessage("internal server error")).toContain("服务暂不可用");
      expect(mapErrorToMessage("upstream")).toContain("服务暂不可用");
      expect(mapErrorToMessage("bad gateway")).toContain("服务暂不可用");
      expect(mapErrorToMessage("service unavailable")).toContain("服务暂不可用");
    });
  });

  describe("Structured ApiError inputs", () => {
    it("maps error payload objects", () => {
      expect(mapErrorToMessage({ error: { code: "RATE_LIMITED", message: "RATE_LIMITED" } })).toContain("请求过于频繁");
      expect(mapErrorToMessage(new ApiClientError({ status: 401, message: "ignored" }))).toContain("未登录");
    });
  });

  describe("Fallback behavior", () => {
    it("returns original message for unrecognized errors", () => {
      expect(mapErrorToMessage("unknown error")).toBe("unknown error");
      expect(mapErrorToMessage("custom business error")).toBe("custom business error");
    });

    it("returns default message for empty input", () => {
      expect(mapErrorToMessage("")).toBe("出现了一点问题，请稍后再试。");
      expect(mapErrorToMessage(null as any)).toBe("出现了一点问题，请稍后再试。");
      expect(mapErrorToMessage(undefined as any)).toBe("出现了一点问题，请稍后再试。");
    });
  });
});
