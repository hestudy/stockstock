/* @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { OptimizationStatus } from "@shared/index";

const pushMock = vi.fn();

const { fetchStatusMock, rerunMock, exportMock, cancelMock } = vi.hoisted(() => ({
  fetchStatusMock: vi.fn<[], Promise<OptimizationStatus>>(),
  rerunMock: vi.fn(),
  exportMock: vi.fn(),
  cancelMock: vi.fn(),
}));

vi.mock("next/navigation", async () => {
  return {
    useRouter: () => ({ push: pushMock }),
  } as any;
});

vi.mock("../../../../../services/optimizations", async () => {
  return {
    fetchOptimizationStatus: fetchStatusMock,
    cancelOptimization: cancelMock,
    rerunOptimization: rerunMock,
    exportOptimizationBundle: exportMock,
  };
});

import Page from "../page";

const baseStatus: OptimizationStatus = {
  id: "opt-1",
  status: "running",
  totalTasks: 10,
  concurrencyLimit: 2,
  summary: {
    total: 10,
    finished: 4,
    running: 3,
    throttled: 3,
    topN: [
      { taskId: "task-1", score: 1.2, resultSummaryId: "summary-1" },
      { taskId: "task-2", score: 1.1, resultSummaryId: "summary-2" },
    ],
  },
  diagnostics: { throttled: false, queueDepth: 1, running: 3 },
  earlyStopPolicy: { metric: "sharpe", threshold: 1.5, mode: "max" },
};

beforeEach(() => {
  fetchStatusMock.mockReset().mockResolvedValue(baseStatus);
  rerunMock.mockReset().mockResolvedValue({ id: "opt-new", status: "queued" });
  exportMock.mockReset().mockResolvedValue({
    jobId: "opt-1",
    status: "running",
    generatedAt: new Date().toISOString(),
    summary: baseStatus.summary,
    items: [],
  });
  cancelMock.mockReset().mockResolvedValue(baseStatus);
  pushMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Optimization Detail Page", () => {
  it("renders progress bar and sorting note", async () => {
    render(<Page params={{ id: "opt-1" }} />);
    const progress = await screen.findByTestId("optimizations-progress");
    expect(progress.textContent).toContain("4/10");
    expect(screen.getByText(/降序展示/)).toBeTruthy();
  });

  it("shows stop reason banner when early stop", async () => {
    fetchStatusMock
      .mockResolvedValueOnce({
        ...baseStatus,
        status: "early-stopped",
        diagnostics: {
          throttled: false,
          queueDepth: 0,
          running: 0,
          stopReason: {
            kind: "EARLY_STOP_THRESHOLD",
            metric: "sharpe",
            threshold: 1.5,
            score: 1.6,
            mode: "max",
          },
        },
      });
    render(<Page params={{ id: "opt-1" }} />);
    const banner = await screen.findByTestId("optimizations-stop-reason");
    expect(banner.textContent).toContain("早停阈值");
  });

  it("invokes rerun and redirects", async () => {
    render(<Page params={{ id: "opt-1" }} />);
    const button = screen.getAllByTestId("optimizations-rerun")[0];
    fireEvent.click(button);
    await waitFor(() => expect(rerunMock).toHaveBeenCalledWith("opt-1"));
    expect(pushMock).toHaveBeenCalledWith("/optimizations/opt-new");
  });

  it("calls export bundle and shows notice", async () => {
    if (typeof URL.createObjectURL !== "function") {
      (URL as any).createObjectURL = () => "mock";
    }
    if (typeof URL.revokeObjectURL !== "function") {
      (URL as any).revokeObjectURL = () => {};
    }
    const createObjectURL = vi.fn().mockReturnValue("blob:link");
    const revokeObjectURL = vi.fn();
    vi.spyOn(URL, "createObjectURL").mockImplementation(createObjectURL);
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(revokeObjectURL);
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});

    render(<Page params={{ id: "opt-1" }} />);
    const button = screen.getAllByTestId("optimizations-export")[0];
    fireEvent.click(button);
    await waitFor(() => expect(exportMock).toHaveBeenCalledWith("opt-1"));
    expect(createObjectURL).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    const notice = await screen.findByTestId("optimizations-detail-notice");
    expect(notice.textContent).toContain("已导出");
  });
});
