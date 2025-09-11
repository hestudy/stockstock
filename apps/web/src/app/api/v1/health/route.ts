import { NextResponse } from "next/server";

// 简单内存速率限制（MVP 用于 QA 验证；Serverless 下非跨实例）
const WINDOW_MS = 10_000; // 10s 窗口
const LIMIT = 3; // 每 IP 每窗口最多 3 次
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  // Next.js 本地/测试环境兜底
  return req.headers.get("x-real-ip") || "local";
}

export async function GET(request: Request) {
  // 速率限制检查
  const ip = getClientIp(request);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    bucket.count += 1;
    if (bucket.count > LIMIT) {
      return NextResponse.json(
        { error: { message: "请求过于频繁，请稍后再试。", reason: "rate_limited" } },
        { status: 429 }
      );
    }
  }

  // 最小占位：仅返回 Web/API 自身的健康状态；
  // 后续可通过内部调用检查 Worker/Queue/Datasource。
  const payload = {
    service: "api",
    status: "up" as const,
    details: {
      api: "up",
      worker: "unknown",
      queue: "unknown",
      datasource: "unknown",
    },
    ts: new Date().toISOString(),
  };
  return NextResponse.json(payload, { status: 200 });
}
