"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { useSpecStore } from "@/store/useSpecStore";

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

/** radians/second of orbital drift during assembly (~4°/s) */
const DRIFT_RATE = 0.07;
/**
 * Hard cap on the drift (~17°). Left uncapped, a 90s generation swings a
 * quarter-turn and ends up staring at the back panel of the piece.
 */
const DRIFT_MAX = 0.3;
/** how fast the drift unwinds once the piece is finished */
const DRIFT_RETURN_K = 1.6;
/** exponential easing constant — higher converges faster */
const EASE_K = 2.5;
/** relative size change that counts as "a different piece" */
const REFRAME_THRESHOLD = 0.08;

const UP = new THREE.Vector3(0, 1, 0);

interface Bbox {
  w: number;
  h: number;
  d: number;
}

/**
 * Framing used at mount by <Canvas camera>; kept in one place so the rig eases
 * toward the same viewpoint the scene opens with.
 *
 * The camera sits at NEGATIVE z. Per the spec convention (schema.ts) z = 0 is
 * the front of the piece, so the long-standing +z camera was framing every
 * design from behind — on a bookshelf that means staring at the back panel
 * with none of the shelves visible.
 */
export function framingFor(bbox: Bbox) {
  const diag = Math.hypot(bbox.w, bbox.h, bbox.d);
  return {
    diag,
    position: [diag * 1.1, diag * 0.75, -diag * 1.1] as [number, number, number],
    near: diag * 0.02,
    far: diag * 12,
  };
}

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

  const engaged = useRef(false);
  const userTook = useRef(false);
  const lastDiag = useRef<number | null>(null);
  const drift = useRef(0);
  // Scratch vectors: allocating per frame would churn the GC at 60fps.
  const desiredPos = useRef(new THREE.Vector3());
  const desiredTarget = useRef(new THREE.Vector3());

  const { diag, position, near, far } = framingFor(bbox);

  // Point the controls at the model's mid-height on mount. The rig owns the
  // target from here on, so <OrbitControls> must not pass a `target` prop.
  useEffect(() => {
    if (!controls) return;
    controls.target.set(0, bbox.h / 2, 0);
    controls.update();
    // Mount-only: later target changes are animated in useFrame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  useEffect(() => {
    if (lastDiag.current === null) {
      lastDiag.current = diag; // opening framing already came from <Canvas>
      return;
    }
    if (Math.abs(diag - lastDiag.current) / lastDiag.current <= REFRAME_THRESHOLD) {
      return;
    }
    lastDiag.current = diag;
    engaged.current = true;
    userTook.current = false;
    applyClipPlanes(camera, near, far);
  }, [diag, near, far, camera]);

  // Every generation engages the rig, not just ones that change the piece's
  // size: a refinement that keeps the dimensions still deserves the assembly
  // choreography. Drift restarts from the canonical 3/4 view each run so the
  // azimuth can't wander around to the back of the piece over several runs.
  useEffect(() => {
    if (!generating) return;
    drift.current = 0;
    engaged.current = true;
    userTook.current = false;
  }, [generating]);

  // Any manual orbit hands the camera to the user for the rest of this piece.
  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      userTook.current = true;
      engaged.current = false;
    };
    controls.addEventListener("start", onStart);
    return () => controls.removeEventListener("start", onStart);
  }, [controls]);

  useFrame((_, rawDelta) => {
    if (!controls || !engaged.current) return;
    const delta = Math.min(rawDelta, 0.1); // a backgrounded tab returns a huge delta

    // Drift out slowly while the piece assembles, then unwind back to the
    // canonical 3/4 view once it is done. Freezing wherever the drift happened
    // to stop is the wrong ending: the last frame is the one the user
    // remembers, so it should be the view that best shows the piece.
    if (generating && !userTook.current) {
      drift.current = Math.min(DRIFT_MAX, drift.current + delta * DRIFT_RATE);
    } else if (drift.current !== 0) {
      drift.current *= Math.exp(-DRIFT_RETURN_K * delta);
      if (Math.abs(drift.current) < 1e-4) drift.current = 0;
    }

    desiredTarget.current.set(0, bbox.h / 2, 0);
    desiredPos.current.set(...position).applyAxisAngle(UP, drift.current);

    const t = 1 - Math.exp(-EASE_K * delta); // frame-rate independent easing
    camera.position.lerp(desiredPos.current, t);
    controls.target.lerp(desiredTarget.current, t);
    controls.update();

    // Once the drift has fully unwound and the ease has converged, stop driving
    // the camera so the user's next orbit starts from a completely idle rig.
    // The drift check matters: mid-unwind the camera and its (still moving)
    // target can pass within epsilon of each other, which would otherwise
    // disengage the rig and strand the view at a half-unwound angle.
    if (
      !generating &&
      drift.current === 0 &&
      camera.position.distanceTo(desiredPos.current) < diag * 0.002
    ) {
      engaged.current = false;
    }
  });

  return null;
}
