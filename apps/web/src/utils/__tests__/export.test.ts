/* @vitest-environment jsdom */
import { describe, it, expect, beforeAll } from "vitest";
import { toCSV, toJSON, downloadText } from "../export";

// jsdom provides Blob/URL, but we avoid actual click side effects

describe("export utils", () => {
  beforeAll(() => {
    // jsdom may not define these; provide stubs for download flow
    (globalThis as any).URL = (globalThis as any).URL || {};
    (globalThis as any).URL.createObjectURL = (globalThis as any).URL.createObjectURL || (() => "blob:stub");
    (globalThis as any).URL.revokeObjectURL = (globalThis as any).URL.revokeObjectURL || (() => {});
  });
  it("toCSV should produce header, metrics row and optional equity", () => {
    const res = toCSV({ id: "job-1", metrics: { return: 0.1, sharpe: 1.2 }, equity: [{ t: 0, v: 1 }] });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const text = res.text;
      expect(text).toContain("id,return,sharpe");
      expect(text).toContain("job-1,0.1,1.2");
      expect(text).toContain("t,v");
      expect(text).toContain("0,1");
    }
  });

  it("toJSON should stringify payload", () => {
    const res = toJSON({ id: "job-2", metrics: { drawdown: 0.05 } });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const obj = JSON.parse(res.text);
      expect(obj.id).toBe("job-2");
      expect(obj.metrics.drawdown).toBe(0.05);
    }
  });

  it("downloadText should not throw in jsdom", () => {
    expect(() => downloadText("hello", "a.txt")).not.toThrow();
  });
});
