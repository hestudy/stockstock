// Minimal OTEL-like metrics without external deps. Console sink or OTLP-ready via env.

function obsEnabled() {
  // read at call time to respect env changes during tests
  return (process.env.OBS_ENABLED ?? "true").toLowerCase() !== "false";
}

function nowMs() {
  try {
    return typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  } catch {
    return Date.now();
  }
}

export function recordHttp(route: string, method: string, status: number, ms: number) {
  if (!obsEnabled()) return;
  const entry = {
    ts: new Date().toISOString(),
    kind: "http_server",
    route,
    method,
    status,
    duration_ms: Math.round(ms),
  };
  // eslint-disable-next-line no-console
  if (process.env.NODE_ENV !== "production") console.info("[METRICS]", entry);
  // TODO: add OTLP exporter when endpoint is configured via OTEL_EXPORTER_OTLP_ENDPOINT
}

export async function timeHttp<T extends Response | any>(
  route: string,
  method: string,
  fn: () => Promise<T>,
  getStatus?: (res: T) => number,
): Promise<T> {
  const start = nowMs();
  try {
    const res = await fn();
    const status = getStatus ? getStatus(res) : ((res as any)?.status ?? 200);
    recordHttp(route, method, status ?? 200, nowMs() - start);
    return res;
  } catch (e: any) {
    recordHttp(route, method, (e?.status ?? 500), nowMs() - start);
    throw e;
  }
}
