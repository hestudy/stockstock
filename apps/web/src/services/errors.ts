export type ErrorReason = "unauthenticated" | "forbidden" | "degraded" | "down" | "unknown";

export const errorMessages: Record<ErrorReason, string> = {
  unauthenticated: "请先登录以访问该页面。",
  forbidden: "抱歉，您没有访问该资源的权限。",
  degraded: "部分服务暂时不可用，我们正在恢复中，请稍后再试。",
  down: "服务暂时不可用，我们正在全力恢复，请稍后再试。",
  unknown: "出现了一点问题，请稍后再试或联系支持。",
};

export function getFriendlyMessage(reason?: string | null): string | null {
  if (!reason) return null;
  if (reason in errorMessages) return errorMessages[reason as ErrorReason];
  return errorMessages.unknown;
}
