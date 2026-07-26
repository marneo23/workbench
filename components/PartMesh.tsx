"use client";

import { useMemo, useRef } from "react";
import { Edges, type EdgesRef } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { RenderPart } from "@/lib/geometry/builder";

interface PartMeshProps {
  part: RenderPart;
  selected: boolean;
  onSelect: (id: string) => void;
  /** animate this part into place as it streams in (wireframe → solid) */
  reveal?: boolean;
  /**
   * Translucent, non-interactive look. "pulsing" reads as work in progress
   * (the pre-stream ghost); "static" reads as frozen and awaiting a decision
   * (a partial assembly rescued from a failed generation).
   */
  ghost?: "pulsing" | "static";
}

const REVEAL_MS = 520;
/** fraction of the reveal spent as a bright wireframe before the fill starts */
const WIRE_PHASE = 0.42;

// THREE.Color has no alpha channel — the old "#00000055" logged "Invalid hex
// color" on every edge and fell back to white. Soft grey is the intended look.
const BASE_EDGE = "#52525b";
const SELECTED_EDGE = "#b45309";
const WIRE_EDGE = new THREE.Color("#38bdf8");

export function PartMesh({
  part,
  selected,
  onSelect,
  reveal = false,
  ghost,
}: PartMeshProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const edgeRef = useRef<EdgesRef>(null);
  const start = useRef<number | null>(null);

  const edgeColor = selected ? SELECTED_EDGE : BASE_EDGE;
  const restEdge = useMemo(() => new THREE.Color(edgeColor), [edgeColor]);

  // Opacity is driven imperatively so re-renders (a sibling part streaming in)
  // never reset an already-revealed part. The JSX `opacity` prop stays constant,
  // so React Three Fiber applies it once and leaves our per-frame value alone.
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    const edge = edgeRef.current?.material;

    if (ghost === "pulsing") {
      const t = performance.now() / 1000;
      m.opacity = 0.4 + 0.15 * (0.5 + 0.5 * Math.sin(t * 2.5)); // gentle breathing
      return;
    }
    if (ghost === "static") {
      m.opacity = 0.45;
      return;
    }
    if (!reveal) return;

    // Wireframe → solid: the part is first sketched as a bright edge cage, then
    // fills in. Reads as "being built" rather than "fading in", and echoes the
    // vector line-work of the PDF the piece is headed for.
    if (start.current === null) start.current = performance.now();
    const p = Math.min(1, (performance.now() - start.current) / REVEAL_MS);

    if (p < WIRE_PHASE) {
      const k = p / WIRE_PHASE;
      m.opacity = 0.12 * k;
      if (edge) {
        edge.opacity = k;
        edge.color.copy(WIRE_EDGE);
      }
    } else {
      const k = (p - WIRE_PHASE) / (1 - WIRE_PHASE);
      const ease = 1 - Math.pow(1 - k, 3); // easeOutCubic
      m.opacity = 0.12 + 0.88 * ease;
      if (edge) {
        edge.opacity = 1;
        // Settle the cage back to the resting edge color so the revealed part
        // is pixel-identical to the committed one — no post-stream flash.
        edge.color.copy(WIRE_EDGE).lerp(restEdge, ease);
      }
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // only the front-most part takes the click
    if (!ghost) onSelect(part.id);
  };

  const transparent = reveal || ghost !== undefined;

  return (
    <mesh position={part.center} onClick={handleClick}>
      <boxGeometry args={part.size} />
      <meshStandardMaterial
        ref={matRef}
        color={selected ? "#f59e0b" : part.color}
        roughness={0.75}
        metalness={0.05}
        transparent={transparent}
        opacity={reveal ? 0 : ghost ? 0.45 : 1}
      />
      <Edges
        ref={edgeRef}
        color={edgeColor}
        threshold={15}
        transparent={reveal}
        opacity={reveal ? 0 : 1}
      />
    </mesh>
  );
}
