import { api } from "./apiClient";
import type { OptimizationSubmitRequest, OptimizationSubmitResponse } from "@shared/index";

export async function submitOptimization(
  payload: OptimizationSubmitRequest,
): Promise<OptimizationSubmitResponse> {
  return api.post<OptimizationSubmitResponse>("/optimizations", payload);
}
