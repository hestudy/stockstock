import { describe, it, expect } from "vitest";
import { mapErrorToMessage } from "../errorMapping";
import { ApiClientError } from "../../services/apiClient";

describe("errorMapping", () => {
  it("maps UNAUTHENTICATED/401", () => {
    expect(mapErrorToMessage("UNAUTHENTICATED")).toContain("未登录");
    expect(mapErrorToMessage("401 Unauthorized")).toContain("未登录");
  });

  it("maps ApiError payload code", () => {
    expect(mapErrorToMessage({ error: { code: "UNAUTHENTICATED", message: "whatever" } })).toContain("未登录");
  });
  it("maps INVALID_ID/400", () => {
    expect(mapErrorToMessage("INVALID_ID")).toContain("参数不合法");
    expect(mapErrorToMessage("400 Bad Request")).toContain("参数不合法");
    expect(mapErrorToMessage({ error: { code: "PARAM_ERROR" } })).toContain("参数不合法");
  });
  it("maps RATE_LIMITED/429", () => {
    expect(mapErrorToMessage("RATE_LIMITED")).toContain("请求过于频繁");
    expect(mapErrorToMessage("429 Too Many Requests")).toContain("请求过于频繁");
  });
  it("maps timeout variants", () => {
    expect(mapErrorToMessage("Timeout")).toContain("超时");
    expect(mapErrorToMessage("timed out while waiting")).toContain("超时");
  });
  it("fallbacks to generic", () => {
    expect(mapErrorToMessage("")).toContain("出现了一点问题");
  });

  it("maps 403 Forbidden", () => {
    expect(mapErrorToMessage("403 Forbidden")).toContain("无权限");
    expect(mapErrorToMessage("FORBIDDEN")).toContain("无权限");
  });

  it("maps 404 Not Found", () => {
    expect(mapErrorToMessage("404 Not Found")).toContain("不存在");
    expect(mapErrorToMessage("Resource not found")).toContain("不存在");
  });

  it("maps 422 Unprocessable Entity/validation", () => {
    expect(mapErrorToMessage("422 Unprocessable Entity")).toContain("参数不合法");
    expect(mapErrorToMessage("Validation failed for field"))
      .toContain("参数不合法");
  });

  it("maps 408 timeout variants", () => {
    expect(mapErrorToMessage("408 Request Timeout")).toContain("超时");
  });

  it("maps 5xx upstream/server errors", () => {
    expect(mapErrorToMessage("500 Internal Server Error")).toContain("暂不可用");
    expect(mapErrorToMessage("502 Bad Gateway")).toContain("暂不可用");
    expect(mapErrorToMessage("503 Service Unavailable")).toContain("暂不可用");
    expect(mapErrorToMessage("504 Gateway Timeout")).toContain("暂不可用");
    expect(mapErrorToMessage("upstream connection error")).toContain("暂不可用");
    expect(mapErrorToMessage({ error: { code: "UPSTREAM_ERROR" } })).toContain("暂不可用");
  });

  it("maps ApiClientError by status and code", () => {
    const statusErr = new ApiClientError({ status: 503, message: "SERVER_ERROR" });
    expect(mapErrorToMessage(statusErr)).toContain("服务暂不可用");

    const codeErr = new ApiClientError({ status: 409, message: "CONFLICT", code: "CONFLICT" });
    expect(mapErrorToMessage(codeErr)).toContain("操作冲突");
    expect(mapErrorToMessage({ error: { code: "BACKTEST_NOT_FOUND" } })).toContain("资源不存在");
    expect(mapErrorToMessage({ error: { code: "ACCESS_DENIED" } })).toContain("无权限");
    expect(mapErrorToMessage({ error: { code: "AUTH_TOKEN_EXPIRED" } })).toContain("未登录");
  });

  it("maps network error variants", () => {
    expect(mapErrorToMessage("Network Error")).toContain("网络");
    expect(mapErrorToMessage("Failed to fetch"))
      .toContain("网络");
    expect(mapErrorToMessage("fetch failed"))
      .toContain("网络");
    expect(mapErrorToMessage("ECONNRESET"))
      .toContain("网络");
  });
});
