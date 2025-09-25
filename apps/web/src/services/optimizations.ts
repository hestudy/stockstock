import { api } from "./apiClient";
import type {
  OptimizationExportBundle,
  OptimizationJob,
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

export type OptimizationRerunOverrides = {
  concurrencyLimit?: number;
  earlyStopPolicy?: OptimizationSubmitRequest["earlyStopPolicy"];
};

export function rerunOptimization(
  id: string,
  overrides?: OptimizationRerunOverrides,
): Promise<OptimizationSubmitResponse> {
  return api.post<OptimizationSubmitResponse>(`/optimizations/${id}/rerun`, overrides);
}

export function exportOptimizationBundle(
  id: string,
): Promise<OptimizationExportBundle> {
  return api.post<OptimizationExportBundle>(`/optimizations/${id}/export`);
}

export function fetchOptimizationHistory(limit = 50): Promise<OptimizationJob[]> {
  const normalized = Number.isFinite(limit) ? Math.max(1, Math.floor(limit)) : 50;
  return api.get<OptimizationJob[]>(`/optimizations/history?limit=${normalized}`);
}
