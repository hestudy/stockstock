const DEFAULT_MESSAGE = "出现了一点问题，请稍后再试。";

type NormalizedError = {
  message?: string;
  code?: string;
  status?: number;
};

const CODE_MAP: Record<string, string> = {
  UNAUTHENTICATED: "未登录或会话已过期，请先登录。",
  UNAUTHORIZED: "无权限访问，如需权限请联系管理员。",
  FORBIDDEN: "无权限访问，如需权限请联系管理员。",
  PERMISSION_DENIED: "无权限访问，如需权限请联系管理员。",
  NOT_FOUND: "资源不存在或已被删除。",
  RESOURCE_NOT_FOUND: "资源不存在或已被删除。",
  STRATEGY_NOT_FOUND: "资源不存在或已被删除。",
  INVALID_ID: "参数不合法，请检查后重试。",
  INVALID_INPUT: "参数不合法，请检查后重试。",
  VALIDATION_FAILED: "参数不合法，请检查后重试。",
  BAD_REQUEST: "参数不合法，请检查后重试。",
  RATE_LIMITED: "请求过于频繁，请稍后重试。",
  TOO_MANY_REQUESTS: "请求过于频繁，请稍后重试。",
  QUOTA_EXCEEDED: "请求过于频繁，请稍后重试。",
  THROTTLED: "请求过于频繁，请稍后重试。",
  REQUEST_TIMEOUT: "请求超时，请检查网络后重试。",
  TIMEOUT: "请求超时，请检查网络后重试。",
  DEADLINE_EXCEEDED: "请求超时，请检查网络后重试。",
  NETWORK_ERROR: "网络异常，请检查网络连接后重试。",
  FETCH_FAILED: "网络异常，请检查网络连接后重试。",
  CONNECTION_RESET: "网络异常，请检查网络连接后重试。",
  CONFLICT: "操作冲突，请刷新后重试。",
  ALREADY_EXISTS: "操作冲突，请刷新后重试。",
  SERVICE_UNAVAILABLE: "服务暂不可用，请稍后再试。",
  UPSTREAM_UNAVAILABLE: "服务暂不可用，请稍后再试。",
  INTERNAL_ERROR: "服务暂不可用，请稍后再试。",
  INTERNAL_SERVER_ERROR: "服务暂不可用，请稍后再试。",
  SERVER_ERROR: "服务暂不可用，请稍后再试。",
  DB_DOWN: "服务暂不可用，请稍后再试。",
  BACKEND_UNAVAILABLE: "服务暂不可用，请稍后再试。",
};

const STATUS_MAP: Record<number, string> = {
  400: "参数不合法，请检查后重试。",
  401: "未登录或会话已过期，请先登录。",
  403: "无权限访问，如需权限请联系管理员。",
  404: "资源不存在或已被删除。",
  408: "请求超时，请检查网络后重试。",
  409: "操作冲突，请刷新后重试。",
  422: "参数不合法，请检查后重试。",
  429: "请求过于频繁，请稍后重试。",
  500: "服务暂不可用，请稍后再试。",
  502: "服务暂不可用，请稍后再试。",
  503: "服务暂不可用，请稍后再试。",
  504: "服务暂不可用，请稍后再试。",
};

function normalize(raw: unknown): NormalizedError {
  if (!raw) return {};
  if (typeof raw === "string") {
    return { message: raw };
  }
  if (raw instanceof Error) {
    const err = raw as Error & { code?: unknown; status?: unknown; statusCode?: unknown };
    return {
      message: err.message,
      code: typeof err.code === "string" ? err.code : undefined,
      status:
        typeof err.status === "number"
          ? err.status
          : typeof err.statusCode === "number"
            ? err.statusCode
            : undefined,
    };
  }
  if (typeof raw === "object") {
    const anyRaw = raw as Record<string, any>;
    if (anyRaw.error && typeof anyRaw.error === "object") {
      const inner = anyRaw.error as Record<string, any>;
      return {
        message: typeof inner.message === "string" ? inner.message : undefined,
        code: typeof inner.code === "string" ? inner.code : undefined,
      };
    }
    return {
      message: typeof anyRaw.message === "string" ? anyRaw.message : undefined,
      code: typeof anyRaw.code === "string" ? anyRaw.code : undefined,
      status:
        typeof anyRaw.status === "number"
          ? anyRaw.status
          : typeof anyRaw.statusCode === "number"
            ? anyRaw.statusCode
            : undefined,
    };
  }
  return { message: String(raw) };
}

export function mapErrorToMessage(raw: unknown): string {
  const normalized = normalize(raw);
  const code = normalized.code?.toUpperCase();
  const status = normalized.status;
  const message = normalized.message ?? "";
  const lower = message.toLowerCase();

  if (code && CODE_MAP[code]) {
    return CODE_MAP[code];
  }

  if (typeof status === "number" && STATUS_MAP[status]) {
    return STATUS_MAP[status];
  }

  // Auth
  if (lower.includes("unauthenticated") || lower.includes("401") || lower.includes("unauthorized")) {
    return "未登录或会话已过期，请先登录。";
  }
  if (lower.includes("forbidden") || lower.includes("403") || lower.includes("permission denied")) {
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
    lower.includes("400") ||
    lower.includes("invalid input")
  ) {
    return "参数不合法，请检查后重试。";
  }

  // Rate limit
  if (
    lower.includes("rate_limited") ||
    lower.includes("too many requests") ||
    lower.includes("429") ||
    lower.includes("rate limit") ||
    lower.includes("too many") ||
    lower.includes("quota")
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
    lower.includes("ehostunreach") ||
    lower.includes("network")
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
    lower.includes("504") ||
    lower.includes("internal_error")
  ) {
    return "服务暂不可用，请稍后再试。";
  }

  return message || DEFAULT_MESSAGE;
}
