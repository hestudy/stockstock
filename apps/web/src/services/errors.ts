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

// 统一前端校验提示（表单与编辑器等）
export type ValidationCode =
  | "invalid_package_name"
  | "invalid_version_format"
  | "requirements_parse_failed"
  | "required_field";

export function formatValidationError(code: ValidationCode, detail?: string): string {
  switch (code) {
    case "invalid_package_name":
      return `依赖名非法：${detail ?? "-"}（仅允许字母、数字、点、下划线、连字符）`;
    case "invalid_version_format":
      return `版本格式非法：${detail ?? "-"}`;
    case "requirements_parse_failed":
      return "依赖清单解析失败，请检查每行格式：name 或 name@version";
    case "required_field":
      return `${detail ?? "该字段"}为必填项`;
    default:
      return errorMessages.unknown;
  }
}
