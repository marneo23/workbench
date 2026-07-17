"use client";

import { Html, Line } from "@react-three/drei";

/**
 * Overall W/H/D dimension lines with mm labels, drawn just outside the
 * (re-centered) bounding box. Per-part dimensions are deferred to v1.1.
 */

interface DimensionOverlayProps {
  bbox: { w: number; h: number; d: number };
}

const LINE_COLOR = "#334155";
const OFFSET = 80; // mm gap between bbox and dimension line
const TICK = 40; // mm extension-line overshoot

function DimLine({
  from,
  to,
  label,
  tickDir,
}: {
  from: [number, number, number];
  to: [number, number, number];
  label: string;
  tickDir: [number, number, number];
}) {
  const mid: [number, number, number] = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  const tick = (p: [number, number, number]): [number, number, number][] => [
    [p[0] - tickDir[0] * TICK, p[1] - tickDir[1] * TICK, p[2] - tickDir[2] * TICK],
    [p[0] + tickDir[0] * TICK, p[1] + tickDir[1] * TICK, p[2] + tickDir[2] * TICK],
  ];

  return (
    <group>
      <Line points={[from, to]} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={tick(from)} color={LINE_COLOR} lineWidth={1.5} />
      <Line points={tick(to)} color={LINE_COLOR} lineWidth={1.5} />
      <Html position={mid} center zIndexRange={[10, 0]}>
        <div className="rounded bg-slate-700 px-1.5 py-0.5 font-mono text-[11px] leading-tight text-white shadow whitespace-nowrap pointer-events-none">
          {label}
        </div>
      </Html>
    </group>
  );
}

export function DimensionOverlay({ bbox }: DimensionOverlayProps) {
  const hw = bbox.w / 2;
  const hd = bbox.d / 2;

  return (
    <group>
      {/* width — along the front bottom edge */}
      <DimLine
        from={[-hw, 0, hd + OFFSET]}
        to={[hw, 0, hd + OFFSET]}
        label={`${bbox.w} mm`}
        tickDir={[0, 0, 1]}
      />
      {/* height — up the front-right edge */}
      <DimLine
        from={[hw + OFFSET, 0, hd]}
        to={[hw + OFFSET, bbox.h, hd]}
        label={`${bbox.h} mm`}
        tickDir={[1, 0, 0]}
      />
      {/* depth — along the bottom right edge */}
      <DimLine
        from={[hw + OFFSET, 0, -hd]}
        to={[hw + OFFSET, 0, hd]}
        label={`${bbox.d} mm`}
        tickDir={[1, 0, 0]}
      />
    </group>
  );
}
