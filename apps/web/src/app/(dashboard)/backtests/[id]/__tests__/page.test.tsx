/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";

vi.mock("next/navigation", async () => {
  return {
    useParams: () => ({ id: "job-123" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  } as any;
});

vi.mock("../../../../services/backtests", async () => {
  return {
    getBacktestStatus: vi
      .fn()
      // first poll: running
      .mockResolvedValueOnce({ id: "job-123", status: "running", progress: 50 })
      // second poll: succeeded
      .mockResolvedValue({ id: "job-123", status: "succeeded", progress: 100 }),
    getBacktestResult: vi.fn().mockResolvedValue({
      id: "job-123",
      metrics: { return: 0.12, drawdown: 0.05, sharpe: 1.4 },
      equity: [
        { t: 0, v: 1 },
        { t: 1, v: 1.01 },
      ],
    }),
  };
});

// dynamic import of the chart will be fine under jsdom
import Page from "../page";

describe("Backtests Detail Page", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("renders summary skeleton then metrics within ~2s via polling", async () => {
    render(<Page />);
    // Skeleton first
    const container = await screen.findByTestId("summary-cards");
    expect(container).toBeInTheDocument();

    // Advance timers to trigger second poll and result fetch
    await act(async () => {
      vi.advanceTimersByTime(1600);
      // allow pending promises to resolve
      await Promise.resolve();
    });

    // Expect metrics visible (e.g., sharpe value formatted)
    expect(container.textContent || "").toMatch(/夏普/i);
  });
});
