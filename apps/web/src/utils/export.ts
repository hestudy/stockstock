import type { ExportPayload } from "@shared/backtest";

export type ExportResult = { ok: true; text: string } | { ok: false; error: string };

export function toCSV(payload: ExportPayload): ExportResult {
  try {
    const lines: string[] = [];
    // Summary metrics
    const metricKeys = Object.keys(payload.metrics || {});
    lines.push(["id", ...metricKeys].join(","));
    lines.push([payload.id, ...metricKeys.map((k) => String(payload.metrics[k] ?? ""))].join(","));
    // Equity
    if (payload.equity && payload.equity.length) {
      lines.push("");
      lines.push("t,v");
      for (const p of payload.equity) lines.push(`${p.t},${p.v}`);
    }
    return { ok: true, text: lines.join("\n") };
  } catch (e: any) {
    return { ok: false, error: e?.message || "CSV 导出失败" };
  }
}

export function toJSON(payload: ExportPayload): ExportResult {
  try {
    return { ok: true, text: JSON.stringify(payload) };
  } catch (e: any) {
    return { ok: false, error: e?.message || "JSON 导出失败" };
  }
}

export function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
