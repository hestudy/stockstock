import { describe, it, expect } from "vitest";
import { wrap } from "../handler";

function req(): Request {
  return new Request("http://localhost/api/test", { method: "GET", headers: { "x-request-id": "test-req" } });
}

describe("handler.wrap", () => {
  it("wraps thrown error into ApiError JSON", async () => {
    const res = await wrap(req(), async () => {
      const e: any = new Error("BAD_THING");
      e.status = 429;
      throw e;
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body).toMatchObject({ error: { message: "BAD_THING", requestId: "test-req" } });
  });
});
