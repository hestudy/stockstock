import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { timeHttp } from "../otel";

const origEnv = { ...process.env } as any;

describe("otel.timeHttp", () => {
  let spy: any;
  beforeEach(() => {
    process.env = { ...origEnv, OBS_ENABLED: "true", NODE_ENV: "test" } as any;
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    process.env = origEnv as any;
  });

  it("records duration and status on success", async () => {
    const res = await timeHttp("/api/v1/demo", "GET", async () => new Response("ok", { status: 200 }));
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalled();
    const payload = spy.mock.calls[0]?.[1];
    expect(payload).toMatchObject({ kind: "http_server", route: "/api/v1/demo", method: "GET", status: 200 });
    expect(typeof payload.duration_ms).toBe("number");
  });

  it("records failure status on error", async () => {
    await expect(
      timeHttp("/api/v1/demo", "GET", async () => {
        const err = new Error("boom") as any;
        err.status = 503;
        throw err;
      }),
    ).rejects.toThrowError("boom");
    const payload = spy.mock.calls.at(-1)?.[1];
    expect(payload).toMatchObject({ status: 503 });
  });

  it("does not emit metrics when OBS is disabled", async () => {
    spy.mockClear();
    process.env.OBS_ENABLED = "false";
    await timeHttp("/api/v1/demo", "GET", async () => new Response("ok", { status: 200 }));
    const calls = spy.mock.calls.filter((c: any[]) => c[0] === "[METRICS]");
    expect(calls.length).toBe(0);
  });

  it("marks exporter as console when no OTLP endpoint is configured", async () => {
    spy.mockClear();
    delete (process.env as any).OTEL_EXPORTER_OTLP_ENDPOINT;
    await timeHttp("/api/v1/demo", "GET", async () => new Response("ok", { status: 200 }));
    const payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("console");
  });

  it("marks exporter as otlp when OTLP endpoint is configured", async () => {
    spy.mockClear();
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    await timeHttp("/api/v1/demo", "GET", async () => new Response("ok", { status: 200 }));
    const payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("otlp");
  });
});

