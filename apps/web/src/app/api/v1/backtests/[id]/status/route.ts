import { NextResponse } from "next/server";
import type { BacktestStatusResponse } from "@shared/backtest";
import { getOwner } from "../../../../_lib/auth";
import { rateLimit } from "../../../../_lib/rateLimit";
import { isValidBacktestId } from "../../../../_lib/validate";
import { timeHttp } from "../../../../_lib/otel";
import { wrap } from "../../../../_lib/handler";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  const route = "/api/v1/backtests/[id]/status";
  return wrap(req, async () =>
    timeHttp(route, "GET", async () => {
      // 参数校验
      if (!isValidBacktestId(id)) {
        return NextResponse.json({ error: { message: "INVALID_ID" } }, { status: 400 });
      }
      let ownerId: string | null = null;
      try {
        // 鉴权：解析 Supabase 会话并获取 ownerId
        const owner = await getOwner();
        ownerId = owner.ownerId;
      } catch {
        return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
      }
      // 速率限制：按用户+路径
      const path = new URL(req.url).pathname;
      const key = `${ownerId}:${path}:GET`;
      const rl = rateLimit(key, { limit: 60, windowMs: 60_000 });
      if (!rl.allowed) {
        return NextResponse.json({ error: { message: "RATE_LIMITED" } }, { status: 429 });
      }
      // 简单模拟：按时间片段切换状态，便于前端轮询
      const now = Date.now();
      const phase = Math.floor((now / 1500) % 3);
      const status: BacktestStatusResponse = {
        id,
        status: phase < 2 ? "running" : "succeeded",
        progress: phase < 2 ? (phase === 0 ? 20 : 70) : 100,
        retries: 0,
        startedAt: new Date(now - 8000).toISOString(),
        finishedAt: phase < 2 ? undefined : new Date(now).toISOString(),
      };
      return NextResponse.json(status);
    }, (res) => (res as any)?.status ?? 200),
  );
}
