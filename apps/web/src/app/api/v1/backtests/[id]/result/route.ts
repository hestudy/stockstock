import { NextResponse } from "next/server";
import type { ResultSummary } from "@shared/backtest";
import { getOwner } from "../../../../_lib/auth";
import { rateLimit } from "../../../../_lib/rateLimit";
import { isValidBacktestId } from "../../../../_lib/validate";

export async function GET(req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
  if (!isValidBacktestId(id)) {
    return NextResponse.json({ error: { message: "INVALID_ID" } }, { status: 400 });
  }
  let ownerId: string | null = null;
  try {
    const owner = await getOwner();
    ownerId = owner.ownerId;
  } catch {
    return NextResponse.json({ error: { message: "UNAUTHENTICATED" } }, { status: 401 });
  }
  const path = new URL(req.url).pathname;
  const rl = rateLimit(`${ownerId}:${path}:GET`, { limit: 60, windowMs: 60_000 });
  if (!rl.allowed) {
    return NextResponse.json({ error: { message: "RATE_LIMITED" } }, { status: 429 });
  }
  const now = Date.now();
  // 简单稳定的模拟数据（便于 2s 首屏断言与联调）
  const metrics = {
    return: 0.1234,
    drawdown: 0.0567,
    sharpe: 1.42,
  } as Record<string, number>;
  const equity = Array.from({ length: 100 }, (_, i) => ({ t: i, v: 1 + Math.sin(i / 10) * 0.05 + i * 0.001 }));
  const payload: ResultSummary = {
    id,
    metrics,
    preview: `ready-${now}`,
    equity,
  };
  return NextResponse.json(payload);
}
