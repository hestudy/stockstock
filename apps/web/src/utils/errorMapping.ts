export function mapErrorToMessage(raw: string): string {
  const lower = (raw || "").toLowerCase();
  if (lower.includes("429") || lower.includes("rate") || lower.includes("too many")) {
    return "请求过于频繁，请稍后重试。";
  }
  if (lower.includes("timeout") || lower.includes("timed out")) {
    return "请求超时，请检查网络后重试。";
  }
  return raw || "出现了一点问题，请稍后再试。";
}
