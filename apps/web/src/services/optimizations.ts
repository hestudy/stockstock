import { api } from "./apiClient";
import type {
  OptimizationStatus,
  OptimizationSubmitRequest,
  OptimizationSubmitResponse,
} from "@shared/index";

export async function submitOptimization(
  payload: OptimizationSubmitRequest,
): Promise<OptimizationSubmitResponse> {
  return api.post<OptimizationSubmitResponse>("/optimizations", payload);
}

export function fetchOptimizationStatus(id: string): Promise<OptimizationStatus> {
  return api.get<OptimizationStatus>(`/optimizations/${id}/status`);
}

export function cancelOptimization(
  id: string,
  reason?: string,
): Promise<OptimizationStatus> {
  const payload = reason ? { reason } : {};
  return api.post<OptimizationStatus>(`/optimizations/${id}/cancel`, payload);
}
