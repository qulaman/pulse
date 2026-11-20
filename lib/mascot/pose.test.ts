import { describe, expect, it } from "vitest";

import { mascotPose, type MascotProps } from "./pose";

const face = (props: Partial<MascotProps>) =>
  mascotPose({ state: "calm", size: 96, level: 0, act: null, carry: null, season: null, gaze: null, ...props });

describe("mascotPose", () => {
  it("shapes the eyes by state as a scale of the one drawn eye", () => {
    expect(face({}).eyeShape).toBe("scale(1, 1)");
    expect(face({ state: "listening" }).eyeShape).toBe("scale(1.06, 1.16)");
    expect(face({ state: "sleeping" }).eyeShape).toBe("scale(0.8, 0.19)");
    expect(face({ state: "happy" }).eyeShape).toBe("scale(0.85, 0.42)");
    expect(face({ state: "serving" }).eyeShape).toBe("scale(0.92, 0.72)");
  });

  it("keeps the happy squint, unless an act's flat «эх» drops it for its length", () => {
    expect(face({ state: "happy" }).squint).toBe(true);
    const shrug = face({ state: "happy", act: "shrug" });
    expect(shrug.squint).toBe(false);
    expect(shrug.flatMouth).toBe("mascot-act-flat-mouth 1.8s ease-in-out both");
    expect(shrug.blink).toBe("mascot-blink 9.2s infinite");
    expect(face({ state: "sleeping" }).blink).toBe("none");
  });

  it("swells with the voice only while listening", () => {
    expect(face({ state: "listening", level: 0.5 }).voiceTransform).toBe(
      "translateY(calc(var(--mascot-level, 0.500) * 2.2px)) scale(calc(1 + var(--mascot-level, 0.500) * 0.14))",
    );
    expect(face({ state: "listening", level: 3 }).voiceTransform).toContain("var(--mascot-level, 1.000)");
    expect(face({ level: 0.5 }).voiceTransform).toBe("translateY(0px) scale(1)");
  });

  it("holds a look: the eyes go there, the head leans, the state's own look is off", () => {
    const look = face({ gaze: { x: 2, y: -0.5 } });
    expect(look.gazeShift).toBe("translate(4.80px, -1.90px)");
    expect(look.lean).toBe("translateX(2.00px) rotate(9.00deg)");
    expect(look.gazeKey).toBe("3:-1");
    expect(look.eyeLoop).toBe("none");
    expect(face({}).gazeKey).toBe("own");
    expect(face({}).eyeLoop).toBe("mascot-glance 9s ease-in-out infinite");
  });

  it("draws no props, gleam or shadow motion at avatar size", () => {
    const small = face({ size: 39, act: "wave", carry: { count: 2 }, season: "new_year" });
    expect(small.detailed).toBe(false);
    expect(small.acting).toBeNull();
    expect(small.holding).toBe(false);
    expect(small.wear).toBe(false);
    expect(small.shadow).toBe("none");
    // the act's body motion and its mouth still play
    expect(small.actBody).toBe("mascot-act-wave-body 1.8s ease-in-out both");
  });

  it("answers the jumps with the ground shadow", () => {
    expect(face({ act: "hop" }).shadow).toBe("mascot-shadow-act-hop 1s both");
    expect(face({ state: "sleeping" }).shadow).toBe("mascot-shadow-sleep 7s ease-in-out infinite");
    expect(face({ state: "awaiting" }).shadow).toBe("mascot-shadow-idle 5.8s ease-in-out infinite");
    expect(face({ state: "thinking" }).shadow).toBe("none");
  });

  it("moves the beacon and the holiday wear aside for what comes to their place", () => {
    expect(face({ state: "alert" }).beacon).toBe(true);
    expect(face({ state: "alert", act: "tick" }).beacon).toBe(false);
    expect(face({ season: "new_year" }).wear).toBe(true);
    expect(face({ season: "new_year", state: "calling" }).wear).toBe(false);
    expect(face({ season: "nauryz", act: "wave" }).wear).toBe(false);
  });

  it("gives an act the free hand: mirrored with the stack in the right hand, its wink to the other eye", () => {
    const wave = face({ act: "wave", carry: { count: 3 } });
    expect(wave.holding).toBe(true);
    expect(wave.flip).toBe(true);
    const wink = face({ act: "wink", carry: { count: 3 } });
    expect(wink.flip).toBe(false);
    expect(wink.lids).toEqual(["mascot-act-half 1.3s ease-in-out both", "mascot-act-wink 1.3s both"]);
    // a job keeps its hands: no stack while the clipboard is held
    expect(face({ state: "checking", carry: { count: 3 } }).holding).toBe(false);
  });

  it("lets the job put down what it can: the pencil on the clipboard, the mitten under the saucer", () => {
    expect(face({ state: "checking", act: "stamp" }).penDown).toBe(true);
    expect(face({ state: "checking", act: "stamp" }).actGaze).toBe("mascot-act-look-board 1.8s ease-in-out both");
    expect(face({ state: "serving", act: "raise" }).mittenOff).toBe("left");
    expect(face({ state: "calm", act: "raise" }).mittenOff).toBeNull();
  });

  it("warms the cheeks for an act only when they are not warm already", () => {
    expect(face({ act: "smile" }).actBlush).toBe(true);
    expect(face({ act: "smile" }).actSmile).toBe("mascot-act-smile 3.2s ease-in-out both");
    expect(face({ state: "happy", act: "smile" }).actBlush).toBe(false);
    expect(face({ act: "hop" }).actBlush).toBe(false);
    expect(face({ act: "smile", size: 30 }).actBlush).toBe(false);
  });
});
