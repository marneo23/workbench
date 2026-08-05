import { describe, expect, it } from "vitest";
import {
  createCameraRigState,
  transitionCameraRig,
  type CameraRigEvent,
} from "@/lib/geometry/camera-rig-state";

type FrameEvent = Extract<CameraRigEvent, { type: "frame" }>;

const frame = (over: Partial<Omit<FrameEvent, "type">> = {}): FrameEvent => ({
  type: "frame" as const,
  generating: false,
  driftStep: 0,
  unwindFactor: 0.5,
  driftMax: 0.4,
  driftEpsilon: 0.001,
  converged: false,
  ...over,
});

describe("camera rig state machine", () => {
  it("starts idle at the opening framing", () => {
    expect(createCameraRigState(100)).toEqual({
      engaged: false,
      userTook: false,
      lastDiag: 100,
      drift: 0,
    });
  });

  it("engages only when a bbox change materially needs reframing", () => {
    const initial = createCameraRigState(100);
    const small = transitionCameraRig(initial, { type: "bbox-change", diag: 105 });
    expect(small).toEqual({ state: initial, reframed: false });

    const large = transitionCameraRig(initial, { type: "bbox-change", diag: 200 });
    expect(large.reframed).toBe(true);
    expect(large.state).toMatchObject({ engaged: true, userTook: false, lastDiag: 200 });
  });

  it("a new generation retakes the camera and resets accumulated drift", () => {
    const prior = { ...createCameraRigState(100), drift: 0.25, userTook: true };
    const result = transitionCameraRig(prior, { type: "generation-start" });
    expect(result.state).toEqual({ ...prior, engaged: true, userTook: false, drift: 0 });
  });

  it("manual orbit yields the rig until the next generation or reframe", () => {
    const engaged = transitionCameraRig(createCameraRigState(100), {
      type: "generation-start",
    }).state;
    const result = transitionCameraRig(engaged, { type: "user-orbit" });
    expect(result.state).toMatchObject({ engaged: false, userTook: true });
  });

  it("drifts while generating and never exceeds the geometric limit", () => {
    const engaged = transitionCameraRig(createCameraRigState(100), {
      type: "generation-start",
    }).state;
    const first = transitionCameraRig(
      engaged,
      frame({ generating: true, driftStep: 0.3, driftMax: 0.4 })
    ).state;
    const second = transitionCameraRig(
      first,
      frame({ generating: true, driftStep: 0.3, driftMax: 0.4 })
    ).state;
    expect(first.drift).toBeCloseTo(0.3);
    expect(second.drift).toBe(0.4);
  });

  it("unwinds fully before disengaging at the canonical view", () => {
    const active = {
      ...createCameraRigState(100),
      engaged: true,
      drift: 0.1,
    };
    const unwinding = transitionCameraRig(
      active,
      frame({ unwindFactor: 0.5, converged: true })
    ).state;
    expect(unwinding).toMatchObject({ engaged: true, drift: 0.05 });

    const settled = transitionCameraRig(
      unwinding,
      frame({ unwindFactor: 0, converged: true })
    ).state;
    expect(settled).toMatchObject({ engaged: false, drift: 0 });
  });

  it("does not drive state after the user has disengaged the rig", () => {
    const idle = createCameraRigState(100);
    const result = transitionCameraRig(
      idle,
      frame({ generating: true, driftStep: 0.2 })
    );
    expect(result.state).toBe(idle);
  });
});
