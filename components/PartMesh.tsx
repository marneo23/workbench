"use client";

import { useRef } from "react";
import { Edges } from "@react-three/drei";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import type * as THREE from "three";
import type { RenderPart } from "@/lib/geometry/builder";

interface PartMeshProps {
  part: RenderPart;
  selected: boolean;
  onSelect: (id: string) => void;
  /** animate opacity 0→1 as this part streams into place */
  reveal?: boolean;
  /** static translucent "pending" look (the pre-stream ghost of the model) */
  dim?: boolean;
}

const REVEAL_MS = 400;

export function PartMesh({
  part,
  selected,
  onSelect,
  reveal = false,
  dim = false,
}: PartMeshProps) {
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const start = useRef<number | null>(null);

  // Opacity is driven imperatively so re-renders (a sibling part streaming in)
  // never reset an already-revealed part. The JSX `opacity` prop stays constant,
  // so React Three Fiber applies it once and leaves our per-frame value alone.
  useFrame(() => {
    const m = matRef.current;
    if (!m) return;
    if (dim) {
      const t = performance.now() / 1000;
      m.opacity = 0.4 + 0.15 * (0.5 + 0.5 * Math.sin(t * 2.5)); // gentle breathing
    } else if (reveal) {
      if (start.current === null) start.current = performance.now();
      m.opacity = Math.min(1, (performance.now() - start.current) / REVEAL_MS);
    }
  });

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // only the front-most part takes the click
    if (!dim) onSelect(part.id);
  };

  const transparent = reveal || dim;

  return (
    <mesh position={part.center} onClick={handleClick}>
      <boxGeometry args={part.size} />
      <meshStandardMaterial
        ref={matRef}
        color={selected ? "#f59e0b" : part.color}
        roughness={0.75}
        metalness={0.05}
        transparent={transparent}
        opacity={reveal ? 0 : dim ? 0.5 : 1}
      />
      <Edges color={selected ? "#b45309" : "#00000055"} threshold={15} />
    </mesh>
  );
}
