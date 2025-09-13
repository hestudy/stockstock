import { NextResponse } from "next/server";
import type { ResultSummary } from "@shared/backtest";

export async function GET(_req: Request, ctx: { params: { id: string } }) {
  const { id } = ctx.params;
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
