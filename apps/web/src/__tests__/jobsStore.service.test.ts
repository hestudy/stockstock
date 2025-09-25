// @vitest-environment node
import { describe, it, expect, beforeEach } from "vitest";
import { jobsStore } from "../services/jobsStore";

describe("services/jobsStore", () => {
  beforeEach(() => {
    jobsStore.reset();
  });

  it("initial state has null submissions", () => {
    const s = jobsStore.getState();
    expect(s.lastSubmittedId).toBeNull();
    expect(s.lastSourceJobId).toBeNull();
  });

  it("recordSubmission updates state and notifies subscribers", () => {
    let notifiedId: string | null = null;
    let notifiedSource: string | null = "__unset";
    const unsub = jobsStore.subscribe((s) => {
      notifiedId = s.lastSubmittedId;
      notifiedSource = s.lastSourceJobId;
    });
    jobsStore.recordSubmission("job-123", "orig-456");
    const current = jobsStore.getState();
    expect(current.lastSubmittedId).toBe("job-123");
    expect(current.lastSourceJobId).toBe("orig-456");
    expect(notifiedId).toBe("job-123");
    expect(notifiedSource).toBe("orig-456");
    unsub();
  });

  it("setLastSubmittedId falls back to recordSubmission without source", () => {
    jobsStore.setLastSubmittedId("job-789");
    const current = jobsStore.getState();
    expect(current.lastSubmittedId).toBe("job-789");
    expect(current.lastSourceJobId).toBeNull();
  });

  it("reset clears state and emits notification", () => {
    let notifications = 0;
    const unsub = jobsStore.subscribe(() => {
      notifications += 1;
    });
    jobsStore.recordSubmission("job-1", "src-1");
    jobsStore.reset();
    const current = jobsStore.getState();
    expect(current.lastSubmittedId).toBeNull();
    expect(current.lastSourceJobId).toBeNull();
    expect(notifications).toBeGreaterThanOrEqual(2);
    unsub();
  });
});
