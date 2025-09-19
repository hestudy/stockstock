import { NextResponse } from "next/server";

export type ApiError = {
  error: {
    message: string;
    code?: string;
    requestId?: string;
    timestamp?: string;
  };
};

function requestIdFrom(req: Request): string | undefined {
  try {
    // Accept an incoming header if present; otherwise generate a short id
    const h = req.headers.get("x-request-id");
    if (h) return h;
  } catch {}
  return Math.random().toString(36).slice(2, 10);
}

export async function wrap(
  req: Request,
  fn: () => Promise<Response>,
): Promise<Response> {
  try {
    return await fn();
  } catch (e: any) {
    const status = normalizeStatus(e);
    const body: ApiError = {
      error: {
        message: safeMessage(e),
        code: e?.code,
        requestId: requestIdFrom(req),
        timestamp: new Date().toISOString(),
      },
    };
    return NextResponse.json(body, { status });
  }
}

function normalizeStatus(e: any): number {
  const s = e?.status ?? e?.statusCode;
  if (typeof s === "number" && s >= 400 && s <= 599) return s;
  return 500;
}

function safeMessage(e: any): string {
  const msg = e?.message ?? "INTERNAL_ERROR";
  if (typeof msg !== "string") return "INTERNAL_ERROR";
  // avoid leaking stack or internals
  return String(msg).slice(0, 200);
}
