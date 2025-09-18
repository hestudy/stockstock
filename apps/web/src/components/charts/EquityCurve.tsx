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

  // 视窗（索引范围）与交互状态（Hooks 必须无条件调用）
  const [view, setView] = React.useState<{ start: number; end: number }>({ start: 0, end: Math.max(0, data.length - 1) });
  const [hover, setHover] = React.useState<{ x: number; y: number; p?: EquityPoint } | null>(null);
  const [dragging, setDragging] = React.useState<{ startX: number; startView: { start: number; end: number } } | null>(null);

  const pad = 10;
  const width = 600;
  const height = 200;

  const visible = React.useMemo(() => {
    if (!data || data.length === 0) return [] as EquityPoint[];
    const start = Math.max(0, Math.min(view.start, data.length - 1));
    const end = Math.max(start, Math.min(view.end, data.length - 1));
    return data.slice(start, end + 1);
  }, [data, view]);

  const hasData = visible.length > 0;
  const xs = hasData ? visible.map((p) => p.t) : [0, 1];
  const ys = hasData ? visible.map((p) => p.v) : [0, 1];
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const scaleX = (x: number) => pad + ((x - minX) / (maxX - minX || 1)) * (width - pad * 2);
  const scaleY = (y: number) => height - pad - ((y - minY) / (maxY - minY || 1)) * (height - pad * 2);
  const d = hasData ? visible.map((p, i) => `${i === 0 ? "M" : "L"}${scaleX(p.t)},${scaleY(p.v)}`).join(" ") : "";

  // 根据鼠标位置找到最近点
  function nearestPoint(clientX: number, rectLeft: number): EquityPoint | undefined {
    const svgX = clientX - rectLeft;
    // 反推 x 对应的 t 值（线性），再找到可见范围内最近 t
    const tRatio = (svgX - pad) / (width - pad * 2);
    const tEst = minX + (maxX - minX) * Math.min(1, Math.max(0, tRatio));
    let best: EquityPoint | undefined;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const p of visible) {
      const dx = Math.abs(p.t - tEst);
      if (dx < bestDist) {
        best = p;
        bestDist = dx;
      }
    }
    return best;
  }

  // 缩放（wheel）：以鼠标为中心点缩放索引窗口
  function onWheel(e: React.WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const delta = Math.sign(e.deltaY); // 1 放大范围（缩小视野），-1 缩小范围（扩大视野）
    const len = view.end - view.start + 1;
    const step = Math.max(5, Math.floor(len * 0.1));
    if (delta > 0 && len > 10) {
      // 缩小视野
      const center = Math.floor((view.start + view.end) / 2);
      const next = { start: Math.max(0, center - Math.floor((len - step) / 2)), end: Math.min(data.length - 1, center + Math.ceil((len - step) / 2)) };
      setView(next);
    } else if (delta < 0 && len < data.length) {
      // 扩大视野
      const center = Math.floor((view.start + view.end) / 2);
      const next = { start: Math.max(0, center - Math.floor((len + step) / 2)), end: Math.min(data.length - 1, center + Math.ceil((len + step) / 2)) };
      if (next.end - next.start + 1 >= 10) setView(next);
    }
  }

  // 拖拽平移
  function onMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    setDragging({ startX: e.clientX, startView: view });
  }
  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const container = e.currentTarget.getBoundingClientRect();
    const pt = nearestPoint(e.clientX, container.left);
    setHover(pt ? { x: e.clientX - container.left, y: scaleY(pt.v), p: pt } : { x: e.clientX - container.left, y: e.clientY - container.top });
    if (dragging) {
      const pxPerIndex = (width - pad * 2) / Math.max(1, view.end - view.start);
      const dx = e.clientX - dragging.startX;
      const shift = Math.round(-dx / pxPerIndex);
      const newStart = Math.max(0, Math.min(data.length - 10, dragging.startView.start + shift));
      const newEnd = Math.min(data.length - 1, newStart + (dragging.startView.end - dragging.startView.start));
      setView({ start: newStart, end: newEnd });
    }
  }
  function onMouseUp() {
    setDragging(null);
  }
  function onMouseLeave() {
    setDragging(null);
    setHover(null);
  }

  if (!hasData) {
    return <div className={className}>暂无曲线数据</div>;
  }

  return (
    <figure className={className} aria-label="净值曲线">
      <div
        role="img"
        aria-label="可缩放与拖拽的净值曲线"
        style={{ position: "relative", width: "100%", height }}
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseLeave}
      >
        <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`}>
          <title>净值曲线（滚轮缩放，按住拖拽）</title>
          <rect x="0" y="0" width={width} height={height} fill="white" />
          <path d={d} stroke="#2563eb" strokeWidth={2} fill="none" />
          {hover?.p && (
            <>
              <circle cx={scaleX(hover.p.t)} cy={scaleY(hover.p.v)} r={3} fill="#ef4444" />
              <line x1={scaleX(hover.p.t)} x2={scaleX(hover.p.t)} y1={pad} y2={height - pad} stroke="#e5e7eb" strokeDasharray="4 4" />
            </>
          )}
        </svg>
        {hover?.p && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: Math.min(width - 120, Math.max(0, hover.x + 8)),
              top: Math.max(0, hover.y + 8),
              pointerEvents: "none",
              background: "rgba(0,0,0,0.7)",
              color: "#fff",
              fontSize: 12,
              padding: "4px 6px",
              borderRadius: 4,
            }}
          >
            <div>t: {hover.p.t}</div>
            <div>v: {hover.p.v.toFixed(4)}</div>
          </div>
        )}
      </div>
      <figcaption className="sr-only">展示回测净值随时间变化的折线图，可通过滚轮缩放、拖拽平移查看细节</figcaption>
    </figure>
  );
}

