// 轻量内存 store（客户端运行时有效），用于记录最近提交的回测 Job ID
// 无第三方依赖，提供订阅/通知能力。

export type JobsState = {
  lastSubmittedId: string | null;
  lastSourceJobId: string | null;
};

type Listener = (s: JobsState) => void;

const state: JobsState = {
  lastSubmittedId: null,
  lastSourceJobId: null,
};

const listeners = new Set<Listener>();

export const jobsStore = {
  getState(): JobsState {
    return { ...state };
  },
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    // 立即同步一次
    try {
      fn({ ...state });
    } catch {}
    return () => listeners.delete(fn);
  },
  recordSubmission(id: string, sourceJobId?: string | null) {
    state.lastSubmittedId = id;
    state.lastSourceJobId = sourceJobId ?? null;
    for (const fn of Array.from(listeners)) {
      try {
        fn({ ...state });
      } catch {}
    }
  },
  setLastSubmittedId(id: string) {
    jobsStore.recordSubmission(id);
  },
  reset() {
    state.lastSubmittedId = null;
    state.lastSourceJobId = null;
    for (const fn of Array.from(listeners)) {
      try {
        fn({ ...state });
      } catch {}
    }
  },
};
