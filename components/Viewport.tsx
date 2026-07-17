"use client";

import { useMemo } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { buildRenderModel } from "@/lib/geometry/builder";
import type { FurnitureSpec } from "@/lib/spec/schema";
import { PartMesh } from "./PartMesh";
import { ScaleFigure } from "./ScaleFigure";
import { DimensionOverlay } from "./DimensionOverlay";

interface ViewportProps {
  spec: FurnitureSpec;
  selectedPartId: string | null;
  onSelectPart: (id: string | null) => void;
  showScaleFigure: boolean;
  showDimensions: boolean;
}

export function Viewport({
  spec,
  selectedPartId,
  onSelectPart,
  showScaleFigure,
  showDimensions,
}: ViewportProps) {
  const model = useMemo(() => buildRenderModel(spec), [spec]);

  // Camera sized from the model: pulled back along the room diagonal.
  const diag = Math.hypot(model.bbox.w, model.bbox.h, model.bbox.d);
  const camPos: [number, number, number] = [diag * 1.1, diag * 0.75, diag * 1.1];
  const target: [number, number, number] = [0, model.bbox.h / 2, 0];

  return (
    <Canvas
      camera={{ position: camPos, fov: 40, near: diag * 0.02, far: diag * 12 }}
      onPointerMissed={() => onSelectPart(null)}
      className="h-full w-full"
    >
      <color attach="background" args={["#f1f5f9"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3000, 5000, 2000]} intensity={1.1} />
      <directionalLight position={[-2000, 2500, -3000]} intensity={0.35} />

      {model.parts.map((part) => (
        <PartMesh
          key={part.id}
          part={part}
          selected={part.id === selectedPartId}
          onSelect={onSelectPart}
        />
      ))}

      {showScaleFigure && <ScaleFigure offsetX={model.bbox.w / 2 + 450} />}
      {showDimensions && <DimensionOverlay bbox={model.bbox} />}

      {/* Finite grid, everything scaled to the model: an infinite grid with a
          fixed huge fade range shimmers/crawls badly at mm scale. */}
      <Grid
        position={[0, -2, 0]}
        args={[diag * 6, diag * 6]}
        cellSize={100}
        cellThickness={0.6}
        cellColor="#cbd5e1"
        sectionSize={1000}
        sectionThickness={1}
        sectionColor="#94a3b8"
        fadeDistance={diag * 3}
        fadeStrength={2.5}
      />
      <OrbitControls
        makeDefault
        target={target}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={diag * 0.3}
        maxDistance={diag * 4}
      />
    </Canvas>
  );
}
