import { api } from "./apiClient";

export type HealthResponse = {
  service: string;
  status: "up" | "degraded" | "down";
  details?: Record<string, any>;
  ts: string;
};

export const getHealth = () => api.get<HealthResponse>(`/health`);
