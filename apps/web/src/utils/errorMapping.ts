export function mapErrorToMessage(raw: string): string {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("unauthenticated") || lower.includes("401")) {
    return "未登录或会话已过期，请先登录。";
  }
  if (lower.includes("invalid_id") || lower.includes("invalid id") || lower.includes("400")) {
    return "参数不合法，请检查后重试。";
  }
  if (lower.includes("rate_limited") || lower.includes("too many requests") || lower.includes("429")) {
    return "请求过于频繁，请稍后重试。";
  }
  if (lower.includes("429") || lower.includes("rate") || lower.includes("too many")) {
    return "请求过于频繁，请稍后重试。";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "请求超时，请检查网络后重试。";
  }
  return raw || "出现了一点问题，请稍后再试。";
}
