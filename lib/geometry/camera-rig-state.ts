import { needsReframe } from "./framing";

export type CameraRigState = {
  engaged: boolean;
  userTook: boolean;
  lastDiag: number;
  drift: number;
};

export type CameraRigEvent =
  | { type: "bbox-change"; diag: number }
  | { type: "generation-start" }
  | { type: "user-orbit" }
  | {
      type: "frame";
      generating: boolean;
      /** Taste stays in the component; this is the precomputed per-frame step. */
      driftStep: number;
      /** Taste stays in the component; this is exp(-returnK * delta). */
      unwindFactor: number;
      driftMax: number;
      driftEpsilon: number;
      /** Whether the animated camera position has reached its target. */
      converged: boolean;
    };

export type CameraRigTransition = {
  state: CameraRigState;
  /** The component uses this to update the camera's near/far clip planes. */
  reframed: boolean;
};

export function createCameraRigState(diag: number): CameraRigState {
  return {
    engaged: false,
    userTook: false,
    lastDiag: diag,
    drift: 0,
  };
}

/**
 * Pure choreography state. Vector math and animation feel remain in the client
 * component; the decisions about ownership, reset, unwind, and disengagement
 * live here so regressions are testable in Node.
 */
export function transitionCameraRig(
  state: CameraRigState,
  event: CameraRigEvent
): CameraRigTransition {
  switch (event.type) {
    case "bbox-change": {
      if (!needsReframe(state.lastDiag, event.diag)) {
        return { state, reframed: false };
      }
      return {
        state: {
          ...state,
          engaged: true,
          userTook: false,
          lastDiag: event.diag,
        },
        reframed: true,
      };
    }

    case "generation-start":
      return {
        state: { ...state, engaged: true, userTook: false, drift: 0 },
        reframed: false,
      };

    case "user-orbit":
      return {
        state: { ...state, engaged: false, userTook: true },
        reframed: false,
      };

    case "frame": {
      if (!state.engaged) return { state, reframed: false };

      let drift = state.drift;
      if (event.generating && !state.userTook) {
        drift = Math.min(event.driftMax, drift + event.driftStep);
      } else if (drift !== 0) {
        drift *= event.unwindFactor;
        if (Math.abs(drift) < event.driftEpsilon) drift = 0;
      }

      return {
        state: {
          ...state,
          drift,
          engaged:
            event.generating || drift !== 0 || !event.converged
              ? state.engaged
              : false,
        },
        reframed: false,
      };
    }
  }
}
