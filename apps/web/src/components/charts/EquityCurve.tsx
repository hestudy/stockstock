"use client";

import React from "react";
import type { EquityPoint } from "@shared/backtest";

export type Props = {
  data?: EquityPoint[];
  className?: string;
};

export default function EquityCurve({ data = [], className }: Props) {
  // 暴露给导出流程（简化联动）
  React.useEffect(() => {
    (window as any).__equity__ = data ?? [];
  }, [data]);

  if (!data.length) {
    return <div className={className}>暂无曲线数据</div>;
  }

  // 简易 SVG 折线图（无外部依赖）
  const xs = data.map((p) => p.t);
  const ys = data.map((p) => p.v);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const pad = 10;
  const width = 600;
  const height = 200;
  const scaleX = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const scaleY = (y: number) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 2);
  const d = data.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.t)},${scaleY(p.v)}`).join(" ");

  return (
    <figure className={className} aria-label="净值曲线">
      <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} role="img">
        <title>净值曲线（可缩放浏览器窗口查看细节）</title>
        <rect x="0" y="0" width={width} height={height} fill="white" />
        <path d={d} stroke="#2563eb" strokeWidth={2} fill="none" />
      </svg>
      <figcaption className="sr-only">展示回测净值随时间变化的折线图</figcaption>
    </figure>
  );
}
