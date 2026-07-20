"use client";

import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useThree, type ThreeEvent } from "@react-three/fiber";
import { useSpecStore } from "@/store/useSpecStore";
import type { Part, Size3, Vec3 } from "@/lib/spec/schema";

// Match the buildable minimum in lib/spec/validate.ts so a drag can't create
// a part thinner than we'd accept.
const MIN = 3;
const AXIS_COLOR = ["#ef4444", "#22c55e", "#3b82f6"] as const; // X / Y / Z
const UP = new THREE.Vector3(0, 1, 0);

interface HandleProps {
  position: THREE.Vector3;
  /** unit outward normal — the drag axis */
  dir: THREE.Vector3;
  color: string;
  size: number;
  onStart: () => void;
  onMove: (delta: number) => void;
  onEnd: () => void;
}

/**
 * One arrow handle. On press it fixes a drag plane that contains the axis and
 * best faces the camera, then tracks the pointer at the document level so the
 * drag continues even when the cursor leaves the little cone.
 */
function Handle({ position, dir, color, size, onStart, onMove, onEnd }: HandleProps) {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const plane = useRef(new THREE.Plane());
  const raycaster = useRef(new THREE.Raycaster());
  const startPt = useRef(new THREE.Vector3());

  const quat = useMemo(
    () => new THREE.Quaternion().setFromUnitVectors(UP, dir),
    [dir]
  );

  const onDown = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();

    // Plane through the handle that contains `dir` and faces the camera as
    // much as possible (stable ray/plane intersection while dragging).
    const camDir = camera.getWorldDirection(new THREE.Vector3());
    const normal = camDir.sub(dir.clone().multiplyScalar(camDir.dot(dir))).normalize();
    plane.current.setFromNormalAndCoplanarPoint(normal, position);
    e.ray.intersectPlane(plane.current, startPt.current);

    onStart();
    document.body.style.cursor = "grabbing";

    const move = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndc = new THREE.Vector2(
        ((ev.clientX - rect.left) / rect.width) * 2 - 1,
        -((ev.clientY - rect.top) / rect.height) * 2 + 1
      );
      raycaster.current.setFromCamera(ndc, camera);
      const hit = new THREE.Vector3();
      if (raycaster.current.ray.intersectPlane(plane.current, hit)) {
        onMove(hit.sub(startPt.current).dot(dir));
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      onEnd();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <group position={position} quaternion={quat}>
      <mesh onPointerDown={onDown} renderOrder={999}>
        <coneGeometry args={[size * 0.4, size, 14]} />
        <meshStandardMaterial color={color} depthTest={false} />
      </mesh>
      {/* Larger invisible-but-raycastable grab area (opacity 0, not visible=false,
          which three would skip in raycasting). */}
      <mesh
        onPointerDown={onDown}
        onPointerOver={() => (document.body.style.cursor = "grab")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <sphereGeometry args={[size * 1.1, 10, 10]} />
        <meshBasicMaterial transparent opacity={0} depthTest={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

interface ResizeGizmoProps {
  part: Part;
  /** scene offset applied by the render builder (spec coords + offset = scene) */
  offset: [number, number, number];
  handleSize: number;
}

const DIMS = ["w", "h", "d"] as const;
const POSS = ["x", "y", "z"] as const;
const UNITS = [
  new THREE.Vector3(1, 0, 0),
  new THREE.Vector3(0, 1, 0),
  new THREE.Vector3(0, 0, 1),
];

/**
 * Six arrow handles around the selected part — pull a face to resize along
 * that axis. The +face grows the size; the −face moves the min corner
 * (clamped at the origin). Live updates during the drag are untracked; the
 * whole drag lands as a single undo step on release.
 */
export function ResizeGizmo({ part, offset, handleSize }: ResizeGizmoProps) {
  const updatePart = useSpecStore((s) => s.updatePart);
  const resizePart = useSpecStore((s) => s.resizePart);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;

  const start = useRef<{ size: Size3; position: Vec3 } | null>(null);
  const active = useRef<{ size: Size3; position: Vec3 } | null>(null);

  const begin = () => {
    start.current = { size: { ...part.size }, position: { ...part.position } };
    active.current = null;
    useSpecStore.temporal.getState().pause(); // don't record every drag frame
    if (controls) controls.enabled = false;
  };

  const move = (axis: number, sign: number, delta: number) => {
    const s0 = start.current;
    if (!s0) return;
    const dim = DIMS[axis];
    const pos = POSS[axis];
    const size: Size3 = { ...s0.size };
    const position: Vec3 = { ...s0.position };

    if (sign > 0) {
      // max face: grow the dimension, min corner unchanged
      size[dim] = Math.max(MIN, s0.size[dim] + delta);
    } else {
      // min face: outward drag (delta > 0) moves the corner out and grows it
      let newSize = Math.max(MIN, s0.size[dim] + delta);
      const grow = newSize - s0.size[dim];
      let newPos = s0.position[pos] - grow;
      if (newPos < 0) {
        // can't cross the origin — pin the face at 0
        newPos = 0;
        newSize = s0.position[pos] + s0.size[dim];
      }
      size[dim] = newSize;
      position[pos] = newPos;
    }

    active.current = { size, position };
    updatePart(part.id, { size, position });
  };

  const end = () => {
    if (controls) controls.enabled = true;
    const s0 = start.current;
    const fin = active.current;
    const temporal = useSpecStore.temporal.getState();
    if (s0 && fin) {
      // Revert to the pre-drag geometry (still paused), then resume and commit
      // the final geometry as one tracked change → a single clean undo entry.
      updatePart(part.id, { size: s0.size, position: s0.position });
      temporal.resume();
      resizePart(part.id, fin.size, fin.position);
    } else {
      temporal.resume(); // a click with no movement — nothing to commit
    }
    start.current = null;
    active.current = null;
  };

  const center = new THREE.Vector3(
    part.position.x + part.size.w / 2 + offset[0],
    part.position.y + part.size.h / 2 + offset[1],
    part.position.z + part.size.d / 2 + offset[2]
  );
  const half = [part.size.w / 2, part.size.h / 2, part.size.d / 2];

  const handles = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [1, -1] as const) {
      const dir = UNITS[axis].clone().multiplyScalar(sign);
      const position = center
        .clone()
        .add(dir.clone().multiplyScalar(half[axis] + handleSize * 0.9));
      handles.push(
        <Handle
          key={`${axis}:${sign}`}
          position={position}
          dir={dir}
          color={AXIS_COLOR[axis]}
          size={handleSize}
          onStart={begin}
          onMove={(d) => move(axis, sign, d)}
          onEnd={end}
        />
      );
    }
  }

  return <group>{handles}</group>;
}
