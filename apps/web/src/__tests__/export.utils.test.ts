/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { toCSV, toJSON } from "../utils/export";

describe("export utils", () => {
  it("toCSV returns csv text with metrics and equity", () => {
    const res = toCSV({ id: "job1", metrics: { return: 0.1, sharpe: 1.2 }, equity: [{ t: 0, v: 1 }, { t: 1, v: 1.01 }] });
    expect(res.ok).toBe(true);
    const text = (res as any).text as string;
    expect(text).toContain("id,return,sharpe");
    expect(text).toContain("job1,0.1,1.2");
    expect(text).toContain("t,v");
    expect(text).toContain("0,1\n1,1.01");
  });

  it("toJSON returns stringified payload", () => {
    const res = toJSON({ id: "job1", metrics: { a: 1 } });
    expect(res.ok).toBe(true);
    const text = (res as any).text as string;
    const obj = JSON.parse(text);
    expect(obj.id).toBe("job1");
    expect(obj.metrics.a).toBe(1);
  });
});
