import { api } from "./apiClient";
import type { BacktestSubmitRequest, BacktestSubmitResponse } from "@shared/backtest";

function uuidv4(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as any).randomUUID();
  }
  // 简易降级实现
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function submitBacktest(
  payload: Omit<BacktestSubmitRequest, "clientRequestId"> & { clientRequestId?: string },
): Promise<BacktestSubmitResponse> {
  const body: BacktestSubmitRequest = {
    ...payload,
    clientRequestId: payload.clientRequestId ?? uuidv4(),
  };
  return api.post<BacktestSubmitResponse>("/backtests", body);
}
