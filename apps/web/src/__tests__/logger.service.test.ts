// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Use dynamic import to allow NODE_ENV manipulation between tests

const _g: any = globalThis as any;

describe("services/logger", () => {
  let infoSpy: any;
  let _warnSpy: any;
  let errorSpy: any;

  beforeEach(async () => {
    infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    _warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("emits JSON logs in non-production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const { logger } = await import("../services/logger");
    logger.info("hello", { a: 1 });
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const arg = (infoSpy as any).mock.calls[0][0];
    expect(() => JSON.parse(arg)).not.toThrow();
    const obj = JSON.parse(arg);
    expect(obj.level).toBe("info");
    expect(obj.msg).toBe("hello");
    expect(obj.meta).toEqual({ a: 1 });
  });

  it("suppresses logs in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // fresh import to get branch executed under production
    const { logger } = await import("../services/logger");
    logger.error("oops");
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
