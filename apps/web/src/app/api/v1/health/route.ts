import { NextResponse } from "next/server";

export async function GET() {
  // 最小占位：仅返回 Web/API 自身的健康状态；
  // 后续可通过内部调用检查 Worker/Queue/Datasource。
  const payload = {
    service: "api",
    status: "up",
    details: {
      api: "up",
      worker: "unknown",
      queue: "unknown",
      datasource: "unknown",
    },
    ts: new Date().toISOString(),
  } as const;
  return NextResponse.json(payload, { status: 200 });
}
