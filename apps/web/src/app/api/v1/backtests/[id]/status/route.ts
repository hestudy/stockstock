import { NextResponse } from "next/server";
import type { BacktestStatusResponse } from "@shared/backtest";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
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
}
