import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { observability } from "../observability";

const origEnv = { ...process.env } as any;

describe("observability", () => {
  let spy: any;
  beforeEach(() => {
    process.env = { ...origEnv, NEXT_PUBLIC_OBS_ENABLED: "true", NODE_ENV: "test" } as any;
    spy = vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    spy.mockRestore();
    process.env = origEnv as any;
  });

  it("should emit summary_rendered event with ms", () => {
    observability.trackSummaryRendered(123, { id: "abc" });
    expect(spy).toHaveBeenCalled();
    const args = spy.mock.calls[0];
    expect(args[0]).toBe("[OBS]");
    const payload = args[1];
    expect(payload).toMatchObject({ evt: "summary_rendered", ms: 123, sid: expect.any(String) });
  });

  it("should emit error event with safe message", () => {
    observability.trackError(new Error("boom"), { id: "abc" });
    const payload = spy.mock.calls.at(-1)?.[1];
    expect(payload).toMatchObject({ evt: "error", error: { message: "boom", name: "Error" } });
  });

  it("should not emit when NEXT_PUBLIC_OBS_ENABLED=false", () => {
    spy.mockClear();
    (process.env as any).NEXT_PUBLIC_OBS_ENABLED = "false";
    observability.trackSummaryRendered(50);
    expect(spy).not.toHaveBeenCalled();
  });

  it("should include exporter=console by default and exporter=otlp when endpoint set", () => {
    // default: no endpoint -> console
    delete (process.env as any).NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT;
    spy.mockClear();
    observability.trackSummaryRendered(77);
    let payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("console");

    // with endpoint -> otlp
    (process.env as any).NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT = "http://localhost:4318";
    spy.mockClear();
    observability.trackError("oops");
    payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("otlp");
  });

  it("should allow runtime toggle of NEXT_PUBLIC_OBS_ENABLED within the same process", () => {
    spy.mockClear();
    // enabled -> should emit
    (process.env as any).NEXT_PUBLIC_OBS_ENABLED = "true";
    observability.trackSummaryRendered(10);
    expect(spy).toHaveBeenCalled();

    // disable -> should not emit
    spy.mockClear();
    (process.env as any).NEXT_PUBLIC_OBS_ENABLED = "false";
    observability.trackSummaryRendered(11);
    expect(spy).not.toHaveBeenCalled();

    // re-enable -> should emit again
    (process.env as any).NEXT_PUBLIC_OBS_ENABLED = "true";
    observability.trackError("boom");
    expect(spy).toHaveBeenCalled();
  });

  it("should treat empty or whitespace OTLP endpoint as console exporter", () => {
    (process.env as any).NEXT_PUBLIC_OBS_ENABLED = "true";

    // empty string -> console
    (process.env as any).NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT = "";
    spy.mockClear();
    observability.trackSummaryRendered(5);
    let payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("console");

    // whitespace -> console
    (process.env as any).NEXT_PUBLIC_OTEL_EXPORTER_OTLP_ENDPOINT = "   ";
    spy.mockClear();
    observability.trackSummaryRendered(6);
    payload = spy.mock.calls.at(-1)?.[1];
    expect(payload.exporter).toBe("console");
  });
});
