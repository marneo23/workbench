"use client";

import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { RenderPart } from "@/lib/geometry/builder";

interface PartMeshProps {
  part: RenderPart;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function PartMesh({ part, selected, onSelect }: PartMeshProps) {
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation(); // only the front-most part takes the click
    onSelect(part.id);
  };

  return (
    <mesh position={part.center} onClick={handleClick}>
      <boxGeometry args={part.size} />
      <meshStandardMaterial
        color={selected ? "#f59e0b" : part.color}
        roughness={0.75}
        metalness={0.05}
      />
      <Edges color={selected ? "#b45309" : "#00000055"} threshold={15} />
    </mesh>
  );
}
