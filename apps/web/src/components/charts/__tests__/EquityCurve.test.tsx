/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import EquityCurve from "../EquityCurve";

afterEach(() => cleanup());

describe("EquityCurve", () => {
  it("renders empty text when no data", () => {
    render(<EquityCurve data={[]} />);
    expect(screen.getByText("暂无曲线数据")).toBeInTheDocument();
  });

  it("renders svg figure with aria when data provided", () => {
    render(<EquityCurve data={[{ t: 0, v: 1 }, { t: 1, v: 1.01 }]} />);
    // figure with aria-label
    const fig = screen.getByLabelText("净值曲线");
    expect(fig).toBeInTheDocument();
    // contains an svg path
    const svgs = fig.getElementsByTagName("svg");
    expect(svgs.length).toBeGreaterThan(0);
  });

  it("shows tooltip on mouse move near a point and handles wheel without crash", () => {
    render(<EquityCurve data={[{ t: 0, v: 1 }, { t: 10, v: 1.1 }, { t: 20, v: 1.05 }]} />);
    const container = screen.getByRole("img", { name: "可缩放与拖拽的净值曲线" });
    // mock getBoundingClientRect to provide left offset
    const orig = container.getBoundingClientRect;
    (container as any).getBoundingClientRect = () => ({ left: 10, top: 0, width: 600, height: 200 } as any);
    // move mouse to trigger hover tooltip
    fireEvent.mouseMove(container, { clientX: 100, clientY: 20 });
    // tooltip role should appear (when a nearest point is found)
    const tooltip = screen.queryByRole("tooltip");
    expect(tooltip).toBeTruthy();
    // wheel should not throw
    expect(() => fireEvent.wheel(container, { deltaY: 1 })).not.toThrow();
    // restore
    (container as any).getBoundingClientRect = orig;
  });
});
