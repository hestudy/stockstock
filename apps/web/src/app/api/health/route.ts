import { NextResponse } from "next/server";

// /api/health - 基础健康检查（NFR: 可观测性）
// 说明：此端点为轻量自检，不依赖外部资源；用于存活与最小就绪验证。
// 注意：速率限制在 CI 中可通过设置 RATE_LIMIT_DISABLED=1 关闭。
const WINDOW_MS = 10_000; // 10s
const LIMIT = 5;
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}

export async function GET(request: Request) {
  const t0 = performance.now();
  const DISABLE_RATE_LIMIT = process.env.RATE_LIMIT_DISABLED === "1";
  if (!DISABLE_RATE_LIMIT) {
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
          { status: 429 },
        );
      }
    }
  }

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
  const res = NextResponse.json(payload, { status: 200 });
  const ms = performance.now() - t0;
  res.headers.set("x-handler-duration", ms.toFixed(3));
  return res;
}
