import { NextResponse } from "next/server";

// /api/ready - 就绪检查（NFR: 可观测性）
// 说明：MVP 版本仅返回应用自身就绪；后续可扩展依赖探测（队列/数据库等）。
export async function GET(_request: Request) {
  const payload = {
    service: "api",
    status: "ready" as const,
    checks: {
      self: true,
      deps: {
        worker: false,
        queue: false,
        datasource: false,
      },
    },
    ts: new Date().toISOString(),
  };
  return NextResponse.json(payload, { status: 200 });
}
