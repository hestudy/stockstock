/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", async () => {
  return {
    useParams: () => ({ id: "job-123" }),
    useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  } as any;
});

// Provide a simple fetch mock as a safety net (shouldn't be used when services are mocked),
// but keeps the test resilient if implementation touches fetch-based client.
const queue = [
  { kind: "status", body: { id: "job-123", status: "running", progress: 50 } },
  { kind: "status", body: { id: "job-123", status: "succeeded", progress: 100 } },
  {
    kind: "result",
    body: {
      id: "job-123",
      metrics: { return: 0.12, drawdown: 0.05, sharpe: 1.4 },
      equity: [
        { t: 0, v: 1 },
        { t: 1, v: 1.01 },
      ],
    },
  },
];
(globalThis as any).fetch = vi.fn(async (_input: any) => {
  const next = queue.shift();
  if (!next) {
    return {
      ok: false,
      status: 404,
      json: async () => ({ message: "not found" }),
    } as any;
  }
  return {
    ok: true,
    status: 200,
    json: async () => next.body,
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
  it("renders summary skeleton then metrics within ~2s via polling", async () => {
    render(<Page />);
    // Skeleton first (synchronous)
    const container = screen.getByTestId("summary-cards");
    expect(container).toBeInTheDocument();
    // Expect metrics visible (e.g., sharpe label present)
    const sharpeEl = await screen.findByText(/夏普/i, {}, { timeout: 3000 });
    expect(sharpeEl).toBeInTheDocument();
  });
});
