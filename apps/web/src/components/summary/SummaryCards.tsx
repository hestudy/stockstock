"use client";

import React from "react";

export type SummaryCardsProps = {
  metrics: Record<string, number>;
  id: string;
};

export default function SummaryCards({ metrics, id }: SummaryCardsProps) {
  const items = [
    { label: "收益", key: "return", fmt: (v: number) => `${(v * 100).toFixed(2)}%` },
    { label: "回撤", key: "drawdown", fmt: (v: number) => `${(v * 100).toFixed(2)}%` },
    { label: "夏普", key: "sharpe", fmt: (v: number) => v.toFixed(2) },
  ];

  async function onExport(kind: "csv" | "json") {
    const mod = await import("../../utils/export");
    const payload = {
      id,
      metrics,
      equity: (window as any).__equity__ ?? [],
    };
    if (kind === "csv") {
      const res = mod.toCSV(payload);
      if (res.ok) mod.downloadText(res.text!, `backtest-${id}.csv`);
      else alert(res.error || "导出失败");
    } else {
      const res = mod.toJSON(payload);
      if (res.ok) mod.downloadText(res.text!, `backtest-${id}.json`);
      else alert(res.error || "导出失败");
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <div key={it.key} className="border rounded p-3">
          <div className="text-xs text-gray-500">{it.label}</div>
          <div className="text-lg font-semibold">{it.fmt(metrics[it.key] ?? 0)}</div>
        </div>
      ))}
      <div className="col-span-full flex gap-2">
        <button className="px-2 py-1 border rounded" aria-label="导出CSV" onClick={() => onExport("csv")}>
          导出 CSV
        </button>
        <button className="px-2 py-1 border rounded" aria-label="导出JSON" onClick={() => onExport("json")}>
          导出 JSON
        </button>
      </div>
    </div>
  );
}
