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

  it("zooms (wheel) reduces visible path segments", () => {
    // 构造足够多的数据点以便缩放前后可见数据发生变化
    const data = Array.from({ length: 101 }, (_, i) => ({ t: i, v: 1 + i * 0.001 }));
    render(<EquityCurve data={data} />);

    const container = screen.getByRole("img", { name: "可缩放与拖拽的净值曲线" });
    const orig = (container as HTMLElement & { getBoundingClientRect: any }).getBoundingClientRect;
    (container as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 200 } as any);

    // 初始 path 的 d 属性（包含全部可见点）
    const pathBefore = container.getElementsByTagName("path")[0];
    const dBefore = pathBefore.getAttribute("d") ?? "";
    expect(dBefore.length).toBeGreaterThan(0);
    const segBefore = (dBefore.match(/L/g) || []).length;

    // 触发缩放（deltaY > 0 表示缩小视野、减少可见点）
    fireEvent.wheel(container, { deltaY: 100 });

    const pathAfter = container.getElementsByTagName("path")[0];
    const dAfter = pathAfter.getAttribute("d") ?? "";
    const segAfter = (dAfter.match(/L/g) || []).length;

    // 断言：缩放后路径由更少的线段组成（"L" 指令数量减少）
    expect(segAfter).toBeLessThan(segBefore);

    (container as any).getBoundingClientRect = orig;
  });

  it("pans (drag) changes visible window and path content", () => {
    const data = Array.from({ length: 120 }, (_, i) => ({ t: i, v: 1 + Math.sin(i / 10) * 0.01 }));
    render(<EquityCurve data={data} />);

    const container = screen.getByRole("img", { name: "可缩放与拖拽的净值曲线" });
    const orig = (container as HTMLElement & { getBoundingClientRect: any }).getBoundingClientRect;
    (container as any).getBoundingClientRect = () => ({ left: 0, top: 0, width: 600, height: 200 } as any);

    // 先缩放一次，减小可见窗口，确保可平移
    fireEvent.wheel(container, { deltaY: 100 });
    const pathEl = container.getElementsByTagName("path")[0];
    const dStart = pathEl.getAttribute("d") ?? "";
    expect(dStart.length).toBeGreaterThan(0);

    // 模拟按下并向右拖拽（平移视窗）
    fireEvent.mouseDown(container, { clientX: 100, clientY: 50 });
    // 拖拽 120px，结合组件中 pxPerIndex，足以产生可见窗口移动
    fireEvent.mouseMove(container, { clientX: 220, clientY: 50 });
    fireEvent.mouseUp(container);

    const dEnd = container.getElementsByTagName("path")[0].getAttribute("d") ?? "";
    // 断言：平移后路径内容发生变化（可见区段改变）
    expect(dEnd).not.toEqual(dStart);

    (container as any).getBoundingClientRect = orig;
  });
});
