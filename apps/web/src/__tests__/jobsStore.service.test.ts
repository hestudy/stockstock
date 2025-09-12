// @vitest-environment node
import { describe, it, expect } from "vitest";
import { jobsStore } from "../services/jobsStore";

describe("services/jobsStore", () => {
  it("initial state has null lastSubmittedId", () => {
    const s = jobsStore.getState();
    expect(s.lastSubmittedId).toBeNull();
  });

  it("setLastSubmittedId updates state and notifies subscribers", () => {
    let notified: string | null = null;
    const unsub = jobsStore.subscribe((s) => {
      notified = s.lastSubmittedId;
    });
    jobsStore.setLastSubmittedId("job-123");
    expect(jobsStore.getState().lastSubmittedId).toBe("job-123");
    expect(notified).toBe("job-123");
    unsub();
  });
});
