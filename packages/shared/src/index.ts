export type ApiError = {
  error: {
    code: string;
    message: string;
  };
};

export type HealthStatus = "up" | "degraded" | "down";

export type HealthSnapshot = {
  service: string;
  status: HealthStatus;
  details?: Record<string, any>;
  ts: string;
};

// Re-export strategy-related shared types
export * from "./strategy";
// Re-export backtest-related shared types
export * from "./backtest";
