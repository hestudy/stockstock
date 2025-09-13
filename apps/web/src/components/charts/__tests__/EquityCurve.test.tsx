/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import EquityCurve from "../EquityCurve";

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
});
