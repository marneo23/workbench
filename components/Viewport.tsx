"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
import { CameraRig } from "./CameraRig";
import { CAMERA_FOV, framingFor } from "@/lib/geometry/framing";
import {
  bindWindowDrag,
  nextActiveDragCount,
} from "@/lib/ui/interaction-state";

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
function DraggableScaleFigure({
  defaultX,
  onDragActiveChange,
}: {
  defaultX: number;
  onDragActiveChange: (active: boolean) => void;
}) {
  const pos = useSpecStore((s) => s.scaleFigurePos);
  const setPos = useSpecStore((s) => s.setScaleFigurePos);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);

  const plane = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)); // floor y=0
  const raycaster = useRef(new THREE.Raycaster());
  const grab = useRef(new THREE.Vector2()); // (x, z) offset from figure origin to grab point
  const cleanupDrag = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupDrag.current?.(), []);

  const x = pos?.[0] ?? defaultX;
  const z = pos?.[1] ?? 0;

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    cleanupDrag.current?.();
    const hit = new THREE.Vector3();
    if (!e.ray.intersectPlane(plane.current, hit)) return;
    grab.current.set(hit.x - x, hit.z - z);
    onDragActiveChange(true);
    document.body.style.cursor = "grabbing";

    const move = (event: Event) => {
      const ev = event as PointerEvent;
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
    const finish = () => {
      cleanupDrag.current = null;
      onDragActiveChange(false);
      document.body.style.cursor = "";
    };
    cleanupDrag.current = bindWindowDrag(window, move, finish);
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
  const salvage = useSpecStore((s) => s.salvage);
  const [controlsEnabled, setControlsEnabled] = useState(true);
  const activeDrags = useRef(0);
  const onDragActiveChange = useCallback((active: boolean) => {
    activeDrags.current = nextActiveDragCount(activeDrags.current, active);
    setControlsEnabled(activeDrags.current === 0);
  }, []);
  const generating = status === "generating";
  // While streaming, render the part-by-part assembly; before the first parts
  // land (or on a bare "generating"), dim the last committed model in place.
  const streaming = generating && pending !== null;
  const preMeta = generating && pending === null;
  // A failed generation leaves its partial assembly on screen, ghosted, so the
  // keep-or-discard choice in the prompt bar is about something visible.
  const showingSalvage = !generating && salvage !== null;

  const committedModel = useMemo(() => buildRenderModel(spec), [spec]);
  const partial = pending ?? salvage;
  const partialModel = useMemo(
    () => (partial ? buildPartialRenderModel(partial) : null),
    [partial]
  );
  const model =
    (streaming || showingSalvage) && partialModel ? partialModel : committedModel;

  // Camera sized from the model: pulled back along the room diagonal. This is
  // the opening framing only — CameraRig owns the camera from mount onward.
  const { diag, position: camPos, near, far } = framingFor(model.bbox);
  const handleSize = Math.min(Math.max(diag * 0.04, 15), 90);
  const selectedPart = spec.parts.find((p) => p.id === selectedPartId);

  return (
    <Canvas
      camera={{ position: camPos, fov: CAMERA_FOV, near, far }}
      onPointerMissed={() => onSelectPart(null)}
      className="h-full w-full"
    >
      <color attach="background" args={["#f1f5f9"]} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3000, 5000, 2000]} intensity={1.1} />
      <directionalLight position={[-2000, 2500, -3000]} intensity={0.35} />

      {(streaming || preMeta || showingSalvage) && <GhostBox bbox={model.bbox} />}

      <SettleGroup>
        {model.parts.map((part) => (
          <PartMesh
            key={part.id}
            part={part}
            selected={!generating && !showingSalvage && part.id === selectedPartId}
            onSelect={generating || showingSalvage ? () => {} : onSelectPart}
            reveal={streaming}
            ghost={preMeta ? "pulsing" : showingSalvage ? "static" : undefined}
          />
        ))}
      </SettleGroup>

      {!generating && !showingSalvage && selectedPart && (
        <ResizeGizmo
          part={selectedPart}
          offset={model.offset}
          handleSize={handleSize}
          onDragActiveChange={onDragActiveChange}
        />
      )}

      {showScaleFigure && (
        <DraggableScaleFigure
          defaultX={model.bbox.w / 2 + 450}
          onDragActiveChange={onDragActiveChange}
        />
      )}
      {showDimensions && <DimensionOverlay bbox={model.bbox} />}

      {/* Finite grid, everything scaled to the model: an infinite grid with a
          fixed huge fade range shimmers/crawls badly at mm scale.

          fadeFrom={0} measures the fade from the world origin — i.e. from the
          piece — instead of drei's default, which measures it from the camera's
          projection onto the floor. That default makes grid visibility depend
          on camera pitch: lowering the camera to eye level pushes its ground
          projection away from the model and fades the floor under the piece to
          ~17% opacity, while a top-down view brings it back. Fading from the
          piece is angle-invariant, and since the fade distance equals the
          grid's half-extent the plane reaches zero exactly at its own edge. */}
      <Grid
        position={[0, -2, 0]}
        args={[diag * 6, diag * 6]}
        cellSize={100}
        cellThickness={0.6}
        cellColor="#94a3b8"
        sectionSize={1000}
        sectionThickness={1}
        sectionColor="#64748b"
        fadeFrom={0}
        fadeDistance={diag * 3}
        fadeStrength={1.2}
      />
      <OrbitControls
        makeDefault
        enabled={controlsEnabled}
        maxPolarAngle={Math.PI / 2 - 0.02}
        minDistance={diag * 0.3}
        maxDistance={diag * 4}
      />
      <CameraRig bbox={model.bbox} />
    </Canvas>
  );
}
