// 最小结构化日志占位（仅开发环境输出）
export type LogLevel = "info" | "warn" | "error";

function log(level: LogLevel, msg: string, meta?: Record<string, unknown>) {
  // 仅在非生产环境打印，避免污染生产控制台
  if (process.env.NODE_ENV === "production") return;
  const record = {
    level,
    time: new Date().toISOString(),
    msg,
    ...(meta ? { meta } : {}),
  };
  // 这里保留为 console 方法，后续可替换为更专业的 logger（pino 等）
  // eslint-disable-next-line no-console
  console[level](JSON.stringify(record));
}

export const logger = {
  info: (msg: string, meta?: Record<string, unknown>) => log("info", msg, meta),
  warn: (msg: string, meta?: Record<string, unknown>) => log("warn", msg, meta),
  error: (msg: string, meta?: Record<string, unknown>) => log("error", msg, meta),
};
