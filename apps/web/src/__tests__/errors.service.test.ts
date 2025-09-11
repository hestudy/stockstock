// @vitest-environment node
import { describe, it, expect } from "vitest";
import { getFriendlyMessage } from "../services/errors";

describe("errors service friendly messages (AC4)", () => {
  it("returns unauthenticated message", () => {
    expect(getFriendlyMessage("unauthenticated")).toContain("请先登录");
  });
  it("returns forbidden message", () => {
    expect(getFriendlyMessage("forbidden")).toContain("没有访问该资源的权限");
  });
  it("returns degraded message", () => {
    expect(getFriendlyMessage("degraded")).toContain("部分服务暂时不可用");
  });
  it("returns down message", () => {
    expect(getFriendlyMessage("down")).toContain("服务暂时不可用");
  });
  it("falls back to unknown message", () => {
    expect(getFriendlyMessage("some-other-error")).toContain("出现了一点问题");
  });
});
