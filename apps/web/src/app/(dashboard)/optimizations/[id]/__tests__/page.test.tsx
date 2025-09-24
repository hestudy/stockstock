/* @vitest-environment jsdom */
import { describe, it, expect } from "vitest";
import { describeTopNSorting } from "../page";

describe("describeTopNSorting", () => {
  it("returns descending copy when scores are in descending order", () => {
    const text = describeTopNSorting([
      { taskId: "t1", score: 1.5 },
      { taskId: "t2", score: 1.1 },
      { taskId: "t3", score: 0.9 },
    ]);
    expect(text).toBe("根据得分降序展示，实时刷新");
  });

  it("returns ascending copy when scores are in ascending order", () => {
    const text = describeTopNSorting([
      { taskId: "t1", score: 0.3 },
      { taskId: "t2", score: 0.5 },
      { taskId: "t3", score: 0.8 },
    ]);
    expect(text).toBe("根据得分升序展示，实时刷新");
  });

  it("falls back to neutral copy when unable to determine order", () => {
    const text = describeTopNSorting([{ taskId: "t1", score: 0.3 }]);
    expect(text).toBe("根据得分排序展示，实时刷新");
  });
});
