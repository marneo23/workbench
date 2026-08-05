"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useSpecStore } from "@/store/useSpecStore";
import {
  DRIFT_MAX,
  framingFor,
} from "@/lib/geometry/framing";
import {
  createCameraRigState,
  transitionCameraRig,
} from "@/lib/geometry/camera-rig-state";

/**
 * Camera choreography during assembly, and the fix for a real framing bug:
 * the <Canvas camera> prop only applies on mount, so a 2000 mm wardrobe
 * generated after an 1800 mm bookshelf used to inherit the bookshelf's
 * framing (and its near/far planes, which could clip).
 *
 * The rig re-frames whenever the piece changes size materially — exactly when
 * the stream's "meta" event lands and a new assembly begins — and adds a slow
 * azimuth drift while parts stream in, so the piece is seen from a moving
 * viewpoint as it builds. It yields to the user on the first manual orbit and
 * stays yielded until the next re-frame: the wait UI never takes the camera
 * away from someone who has grabbed it.
 */

/**
 * Timing constants live here because they are animation feel, not geometry.
 * The geometry (where the camera goes, how far it may drift, what counts as a
 * re-frame) lives in lib/geometry/framing.ts, where it is unit-tested.
 */

/** radians/second of orbital drift during assembly (~4°/s) */
const DRIFT_RATE = 0.07;
/** how fast the drift unwinds once the piece is finished */
const DRIFT_RETURN_K = 1.6;
/** exponential easing constant — higher converges faster */
const EASE_K = 2.5;

const UP = new THREE.Vector3(0, 1, 0);

type Bbox = { w: number; h: number; d: number };

/** Clip planes are mount-only on the Canvas camera; a much larger or smaller
 *  piece needs them rescaled or it clips. */
function applyClipPlanes(camera: THREE.PerspectiveCamera, near: number, far: number) {
  camera.near = near;
  camera.far = far;
  camera.updateProjectionMatrix();
}

export function CameraRig({ bbox }: { bbox: Bbox }) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const controls = useThree((s) => s.controls) as OrbitControlsImpl | null;
  const generating = useSpecStore((s) => s.status === "generating");

  const rig = useRef<ReturnType<typeof createCameraRigState> | null>(null);
  // Scratch vectors: allocating per frame would churn the GC at 60fps.
  const desiredPos = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());

  const { diag, position, target, near, far } = framingFor(bbox);
  if (rig.current === null) rig.current = createCameraRigState(diag);

  // Point the controls at the model's mid-height on mount. The rig owns the
  // target from here on, so <OrbitControls> must not pass a `target` prop.
  useEffect(() => {
    if (!controls) return;
    controls.target.set(...target);
    controls.update();
    // Mount-only: later target changes are animated in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  useEffect(() => {
    const result = transitionCameraRig(rig.current!, {
      type: "bbox-change",
      diag,
    });
    rig.current = result.state;
    if (result.reframed) applyClipPlanes(camera, near, far);
  }, [diag, near, far, camera]);

  // Every generation engages the rig, not just ones that change the piece's
  // size: a refinement that keeps the dimensions still deserves the assembly
  // choreography. Drift restarts from the canonical 3/4 view each run so the
  // azimuth can't wander around to the back of the piece over several runs.
  useEffect(() => {
    if (!generating) return;
    rig.current = transitionCameraRig(rig.current!, {
      type: "generation-start",
    }).state;
  }, [generating]);

  // Any manual orbit hands the camera to the user for the rest of this piece.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      rig.current = transitionCameraRig(rig.current!, {
        type: "user-orbit",
      }).state;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);

  useFrame((_, rawDelta) => {
    if (!controls || !rig.current?.engaged) return;
    const delta = Math.min(rawDelta, 0.1); // a backgrounded tab returns a huge delta

    // Drift out slowly while the piece assembles, then unwind back to the
    // canonical 3/4 view once it is done. Freezing wherever the drift happened
    // to stop is the wrong ending: the last frame is the one the user
    // remembers, so it should be the view that best shows the piece.
    rig.current = transitionCameraRig(rig.current, {
      type: "frame",
      generating,
      driftStep: delta * DRIFT_RATE,
      unwindFactor: Math.exp(-DRIFT_RETURN_K * delta),
      driftMax: DRIFT_MAX,
      driftEpsilon: 1e-4,
      // Convergence is checked after this frame's camera movement below.
      converged: false,
    }).state;

    desiredTarget.current.set(...target);
    desiredPos.current.set(...position).applyAxisAngle(UP, rig.current.drift);

    const t = 1 - Math.exp(-EASE_K * delta); // frame-rate independent easing
    camera.position.lerp(desiredPos.current, t);
    controls.target.lerp(desiredTarget.current, t);
    controls.update();

    // Once the drift has fully unwound and the ease has converged, stop driving
    // the camera so the user's next orbit starts from a completely idle rig.
    // The drift check matters: mid-unwind the camera and its (still moving)
    // target can pass within epsilon of each other, which would otherwise
    // disengage the rig and strand the view at a half-unwound angle.
    if (!generating && rig.current.drift === 0) {
      rig.current = transitionCameraRig(rig.current, {
        type: "frame",
        generating: false,
        driftStep: 0,
        unwindFactor: 1,
        driftMax: DRIFT_MAX,
        driftEpsilon: 1e-4,
        converged: camera.position.distanceTo(desiredPos.current) < diag * 0.002,
      }).state;
    }
  });

  return null;
}
