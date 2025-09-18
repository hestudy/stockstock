import { describe, it, expect } from "vitest";
import { mapErrorToMessage } from "../errorMapping";

describe("errorMapping", () => {
  it("maps UNAUTHENTICATED/401", () => {
    expect(mapErrorToMessage("UNAUTHENTICATED")).toContain("未登录");
    expect(mapErrorToMessage("401 Unauthorized")).toContain("未登录");
  });
  it("maps INVALID_ID/400", () => {
    expect(mapErrorToMessage("INVALID_ID")).toContain("参数不合法");
    expect(mapErrorToMessage("400 Bad Request")).toContain("参数不合法");
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
});
