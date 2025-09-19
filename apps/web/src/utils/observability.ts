// Minimal observability utilities for FE (enabled via NEXT_PUBLIC_OBS_ENABLED)
// No external deps; emits structured events. Replace sinks with Sentry/OTLP later.

function obsEnabled() {
  // read at call time to respect env changes during tests
  return (process.env.NEXT_PUBLIC_OBS_ENABLED ?? "true").toLowerCase() !== "false";
}

function baseContext() {
  try {
    const url = typeof window !== "undefined" ? window.location.pathname : "";
    // simple session id per tab
    const sid = typeof sessionStorage !== "undefined"
      ? (sessionStorage.getItem("sid") || (() => {
          const v = Math.random().toString(36).slice(2);
          sessionStorage.setItem("sid", v);
          return v;
        })())
      : "n/a";
    return { route: url, sid };
  } catch {
    return { route: "", sid: "n/a" };
  }
}

function exporterKind() {
  const endpoint = process.env.NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  return endpoint ? "otlp" : "console";
}

function emit(event: Record<string, unknown>) {
  if (!obsEnabled()) return;
  const payload = { ts: new Date().toISOString(), exporter: exporterKind(), ...baseContext(), ...event };
  // Minimal sink: console.info in dev/CI. Replace with Sentry/OTLP as needed.
  // Avoid noisy logs in production builds by guarding with env.
  // eslint-disable-next-line no-console
  if (process.env.NODE_ENV !== "production") console.info("[OBS]", payload);
  // Test hook for E2E: expose events on window for strict assertions
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    const w = window as any;
    if (!Array.isArray(w.__OBS_EVENTS__)) w.__OBS_EVENTS__ = [];
    w.__OBS_EVENTS__.push(payload);
  }
  // TODO: hook to window.__SENTRY__ or custom transport here when available
}

export function trackSummaryRendered(ms: number, extra?: Record<string, unknown>) {
  if (Number.isFinite(ms) && ms >= 0) emit({ evt: "summary_rendered", ms, ...extra });
}

export function trackError(error: unknown, extra?: Record<string, unknown>) {
  const safe = normalizeError(error);
  emit({ evt: "error", error: safe, ...extra });
}

function normalizeError(err: unknown) {
  if (!err) return { message: "UNKNOWN" };
  if (typeof err === "string") return { message: err.slice(0, 300) };
  if (err instanceof Error) return { message: err.message.slice(0, 300), name: err.name };
  try {
    return { message: JSON.stringify(err).slice(0, 500) };
  } catch {
    return { message: "UNSERIALIZABLE" };
  }
}

export const observability = { trackSummaryRendered, trackError };
