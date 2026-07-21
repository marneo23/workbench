"use client";

import { useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Edges, Grid, OrbitControls } from "@react-three/drei";
import { buildPartialRenderModel, buildRenderModel } from "@/lib/geometry/builder";
import type { FurnitureSpec } from "@/lib/spec/schema";
import { useSpecStore } from "@/store/useSpecStore";
import { PartMesh } from "./PartMesh";
import { ScaleFigure } from "./ScaleFigure";
import { DimensionOverlay } from "./DimensionOverlay";
import { ResizeGizmo } from "./ResizeGizmo";

/**
 * Translucent, gently-breathing bounding volume shown while a piece generates —
 * a proportioned "ghost" the streamed parts fill in, so the wait reads as
 * "assembling" rather than an empty or frozen scene.
 */
function GhostBox({ bbox }: { bbox: { w: number; h: number; d: number } }) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(() => {
    if (matRef.current) {
      const t = performance.now() / 1000;
      matRef.current.opacity = 0.05 + 0.05 * (0.5 + 0.5 * Math.sin(t * 2.5));
    }
  });
  return (
    <mesh position={[0, bbox.h / 2, 0]}>
      <boxGeometry args={[bbox.w, bbox.h, bbox.d]} />
      <meshBasicMaterial ref={matRef} color="#0284c7" transparent opacity={0.08} />
      <Edges color="#38bdf8" threshold={15} />
    </mesh>
  );
}

/**
 * Peak-end flourish: when a generation finishes, the assembled piece eases up
 * to full size — a short "snap together" that gives the wait a satisfying
 * close (the moment users remember most).
 */
function SettleGroup({ children }: { children: ReactNode }) {
  const status = useSpecStore((s) => s.status);
  const ref = useRef<THREE.Group>(null);
  const prev = useRef(status);
  const start = useRef<number | null>(null);

  useFrame(() => {
    if (prev.current === "generating" && status === "idle") {
      start.current = performance.now();
    }
    prev.current = status;

    const g = ref.current;
    if (!g) return;
    if (start.current === null) {
      g.scale.setScalar(1);
      return;
    }
    const p = Math.min(1, (performance.now() - start.current) / 380);
    const ease = 1 - Math.pow(1 - p, 3); // easeOutCubic
    g.scale.setScalar(0.98 + 0.02 * ease);
    if (p >= 1) start.current = null;
  });

  return <group ref={ref}>{children}</group>;
}

/**
 * Scale figure you grab and slide along the floor — no gizmo arrows. Press
 * anywhere on the figure and drag; the pointer is tracked against the floor
 * plane so the grabbed point stays under the cursor.
 */
function DraggableScaleFigure({ defaultX }: { defaultX: number }) {
  const pos = useSpecStore((s) => s.scaleFigurePos);
  const setPos = useSpecStore((s) => s.setScaleFigurePos);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)); // floor y=0
  const raycaster = useRef(new THREE.Raycaster());
  const grab = useRef(new THREE.Vector2()); // (x, z) offset from figure origin to grab point

  const x = pos?.[0] ?? defaultX;
  const z = pos?.[1] ?? 0;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane.current, hit)) return;
    grab.current.set(hit.x - x, hit.z - z);
    if (controls) controls.enabled = false;
    document.body.style.cursor = "grabbing";

    const move = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(ndc, camera);
      const p = new THREE.Vector3();
      if (raycaster.current.ray.intersectPlane(plane.current, p)) {
        setPos([p.x - grab.current.x, p.z - grab.current.y]);
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      if (controls) controls.enabled = true;
      document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <group
      position={[x, 0, z]}
      onPointerDown={onDown}
      onPointerOver={() => (document.body.style.cursor = "grab")}
      onPointerOut={() => (document.body.style.cursor = "")}
    >
      <ScaleFigure offsetX={0} />
    </group>
  );
}

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
  const status = useSpecStore((s) => s.status);
  const pending = useSpecStore((s) => s.pending);
  const generating = status === "generating";
  // While streaming, render the part-by-part assembly; before the first parts
  // land (or on a bare "generating"), dim the last committed model in place.
  const streaming = generating && pending !== null;
  const preMeta = generating && pending === null;

  const committedModel = useMemo(() => buildRenderModel(spec), [spec]);
  const pendingModel = useMemo(
    () => (pending ? buildPartialRenderModel(pending) : null),
    [pending]
  );
  const model = streaming && pendingModel ? pendingModel : committedModel;

  // Camera sized from the model: pulled back along the room diagonal.
  const diag = Math.hypot(model.bbox.w, model.bbox.h, model.bbox.d);
  const camPos: [number, number, number] = [diag * 1.1, diag * 0.75, diag * 1.1];
  const target: [number, number, number] = [0, model.bbox.h / 2, 0];
  const handleSize = Math.min(Math.max(diag * 0.04, 15), 90);
  const selectedPart = spec.parts.find((p) => p.id === selectedPartId);

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

      {(streaming || preMeta) && <GhostBox bbox={model.bbox} />}

      <SettleGroup>
        {model.parts.map((part) => (
          <PartMesh
            key={part.id}
            part={part}
            selected={!generating && part.id === selectedPartId}
            onSelect={generating ? () => {} : onSelectPart}
            reveal={streaming}
            dim={preMeta}
          />
        ))}
      </SettleGroup>

      {!generating && selectedPart && (
        <ResizeGizmo part={selectedPart} offset={model.offset} handleSize={handleSize} />
      )}

      {showScaleFigure && <DraggableScaleFigure defaultX={model.bbox.w / 2 + 450} />}
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
