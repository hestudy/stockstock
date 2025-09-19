import { NextResponse } from "next/server";
import type { BacktestSubmitRequest, BacktestSubmitResponse, JobStatus } from "@shared/backtest";
import { getSupabaseServerClient } from "../../../../services/supabaseServer";
import { rateLimit } from "../../_lib/rateLimit";

// 幂等窗口（5 分钟）
const IDEMPOTENCY_WINDOW_MS = 5 * 60 * 1000;
const idempotencyCache = new Map<string, { id: string; savedAt: number }>();

function getClientIp(req: Request): string {
  const xf = req.headers.get("x-forwarded-for");
  if (xf) return xf.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "local";
}

export async function POST(request: Request) {
  const DISABLE_RATE_LIMIT = process.env.RATE_LIMIT_DISABLED === "1";
  if (!DISABLE_RATE_LIMIT) {
    const ip = getClientIp(request);
    const key = `${ip}:/api/v1/backtests`;
    const { allowed } = rateLimit(key, { limit: 5, windowMs: 10_000 });
    if (!allowed) {
      return NextResponse.json(
        { error: { message: "请求过于频繁，请稍后再试。", reason: "rate_limited" } },
        { status: 429 },
      );
    }
  }

  // 服务器侧鉴权（允许测试环境通过开关跳过）
  if (process.env.E2E_AUTH_BYPASS !== "1") {
    try {
      const supabase = getSupabaseServerClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        return NextResponse.json(
          { error: { message: "请先登录以提交回测。", reason: "unauthenticated" } },
          { status: 401 },
        );
      }
    } catch {
      // 保守处理：若 Supabase 客户端不可用，视为未认证
      return NextResponse.json(
        { error: { message: "请先登录以提交回测。", reason: "unauthenticated" } },
        { status: 401 },
      );
    }
  }

  let body: BacktestSubmitRequest | null = null;
  try {
    body = (await request.json()) as BacktestSubmitRequest;
  } catch {
    return NextResponse.json(
      { error: { message: "请求体解析失败", reason: "invalid_json" } },
      { status: 400 },
    );
  }

  if (
    !body ||
    typeof body.versionId !== "string" ||
    !body.versionId.trim() ||
    typeof body.params !== "object"
  ) {
    return NextResponse.json(
      { error: { message: "参数非法：versionId/params 必填", reason: "invalid_request" } },
      { status: 400 },
    );
  }

  // 幂等键占位（实际应落盘/缓存），当前仅透传
  const clientRequestId = body.clientRequestId || "";

  // 检查幂等缓存（窗口内返回同一 id）
  if (clientRequestId) {
    const cached = idempotencyCache.get(clientRequestId);
    const now = Date.now();
    if (cached && now - cached.savedAt <= IDEMPOTENCY_WINDOW_MS) {
      const payload: BacktestSubmitResponse = { id: cached.id, status: "queued" };
      const res = NextResponse.json(payload, { status: 202 });
      res.headers.set("x-client-request-id", clientRequestId);
      res.headers.set("x-idempotent", "1");
      return res;
    }
  }

  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const status: JobStatus = "queued";
  const payload: BacktestSubmitResponse = { id, status };

  // 写入幂等缓存
  if (clientRequestId) {
    idempotencyCache.set(clientRequestId, { id, savedAt: Date.now() });
  }

  const res = NextResponse.json(payload, { status: 202 });
  if (clientRequestId) res.headers.set("x-client-request-id", clientRequestId);
  return res;
}
