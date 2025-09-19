export function mapErrorToMessage(raw: string): string {
  const lower = (raw || "").toLowerCase();

  // Auth
  if (lower.includes("unauthenticated") || lower.includes("401")) {
    return "未登录或会话已过期，请先登录。";
  }
  if (lower.includes("forbidden") || lower.includes("403")) {
    return "无权限访问，如需权限请联系管理员。";
  }

  // Not Found
  if (lower.includes("not found") || lower.includes("404")) {
    return "资源不存在或已被删除。";
  }

  // Validation / Bad Request
  if (
    lower.includes("invalid_id") ||
    lower.includes("invalid id") ||
    lower.includes("validation") ||
    lower.includes("unprocessable entity") ||
    lower.includes("422") ||
    lower.includes("400")
  ) {
    return "参数不合法，请检查后重试。";
  }

  // Rate limit
  if (
    lower.includes("rate_limited") ||
    lower.includes("too many requests") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many")
  ) {
    return "请求过于频繁，请稍后重试。";
  }

  // Timeouts (exclude 504/gateway timeout which should be treated as server unavailable)
  if (
    (lower.includes("timeout") || lower.includes("timed out") || lower.includes("408")) &&
    !(lower.includes("504") || lower.includes("gateway timeout"))
  ) {
    return "请求超时，请检查网络后重试。";
  }

  // Network errors
  if (
    lower.includes("network error") ||
    lower.includes("failed to fetch") ||
    lower.includes("fetch failed") ||
    lower.includes("econnreset") ||
    lower.includes("enetunreach") ||
    lower.includes("ehostunreach")
  ) {
    return "网络异常，请检查网络连接后重试。";
  }

  // Upstream or server errors
  if (
    lower.includes("internal server error") ||
    lower.includes("upstream") ||
    lower.includes("bad gateway") ||
    lower.includes("service unavailable") ||
    lower.includes("gateway timeout") ||
    lower.includes("500") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return "服务暂不可用，请稍后再试。";
  }

  return raw || "出现了一点问题，请稍后再试。";
}
