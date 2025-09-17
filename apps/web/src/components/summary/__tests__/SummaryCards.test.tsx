// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import SummaryCards from "../SummaryCards";

vi.mock("../../../utils/export", () => ({
  toCSV: (p: any) => ({ ok: true, text: "id,return,drawdown,sharpe\n" + p.id }),
  toJSON: (p: any) => ({ ok: true, text: JSON.stringify(p) }),
  downloadText: vi.fn(),
}));

afterEach(() => {
  cleanup();
});

describe("SummaryCards", () => {
  it("renders metrics and export buttons", async () => {
    render(<SummaryCards id="job-1" metrics={{ return: 0.1, drawdown: 0.05, sharpe: 1.23 }} />);
    expect(screen.getByText(/收益/)).toBeInTheDocument();
    expect(screen.getByText(/回撤/)).toBeInTheDocument();
    expect(screen.getByText(/夏普/)).toBeInTheDocument();
    // export buttons
    expect(screen.getByRole("button", { name: "导出CSV" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出JSON" })).toBeInTheDocument();
  });

  it("triggers export actions", async () => {
    const user = userEvent.setup();
    const mod = await import("../../../utils/export");
    const spy = vi.spyOn(mod, "downloadText");

    render(<SummaryCards id="job-2" metrics={{ return: 0.2, drawdown: 0.01, sharpe: 2.0 }} />);

    await user.click(screen.getByRole("button", { name: "导出CSV" }));
    await user.click(screen.getByRole("button", { name: "导出JSON" }));

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
