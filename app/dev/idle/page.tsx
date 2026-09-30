"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

import { Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { DESK_H, DESK_W, SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { SecretaryMascot } from "@/components/secretary/SecretaryMascot";
import type { DeskPhase, DeskScene } from "@/lib/errands/scene";

/** Where the desk stands on Пульс, from the middle of the face (app/(director)/pulse/page.tsx). */
const DESK_AT = { x: 80, y: -14 };

type Step = { state: MascotState; act: MascotAct | null; gaze: { x: number; y: number } | null; carry: number; ms: number };

/** `calm:2000,listening:1500,working/2+nod:1200,calm@1;0:900` — state, stack size, act, a held look, how long. */
function parseSeq(seq: string): Step[] {
  return seq.split(",").map((part) => {
    const [head, ms] = part.split(":");
    const [stateAct, look] = head!.split("@");
    const [stateCarry, act] = stateAct!.split("+");
    const [state, carry] = stateCarry!.split("/");
    const [gx, gy] = look ? look.split(";").map(Number) : [];
    return {
      state: state as MascotState,
      act: (act ?? null) as MascotAct | null,
      gaze: look ? { x: gx!, y: gy ?? 0 } : null,
      carry: Number(carry ?? 0),
      ms: Number(ms ?? 2000),
    };
  });
}

/** The face going through `seq` step by step, the way a screen switches it (no remount between steps). */
function Sequence({ steps }: { steps: Step[] }) {
  const [index, setIndex] = useState(0);
  const step = steps[index % steps.length]!;
  useEffect(() => {
    const timer = setTimeout(() => setIndex((value) => value + 1), step.ms);
    return () => clearTimeout(timer);
  }, [index, step.ms]);
  return (
    <span data-step={index} data-step-state={step.state} data-step-act={step.act ?? ""}>
      <Mascot state={step.state} size={128} act={step.act} gaze={step.gaze} carry={step.carry > 0 ? { count: step.carry } : null} />
    </span>
  );
}

type SecStep = { phase: DeskPhase | "attending"; scene: DeskScene | null; ms: number };

/** `rest:2000,asked-coffee:1500,doing-coffee:3000,done-coffee:2200,attending:1200` (attending — the desk only). */
function parseSecSeq(seq: string): SecStep[] {
  return seq.split(",").map((part) => {
    const [head, ms] = part.split(":");
    const [phase, scene] = head!.split("-");
    return { phase: phase as SecStep["phase"], scene: (scene ?? null) as DeskScene | null, ms: Number(ms ?? 2000) };
  });
}

/** The secretary's own face (`sec`) or the director's desk (`deskseq`) walking through the steps. */
function SecSequence({ steps, desk }: { steps: SecStep[]; desk: boolean }) {
  const [index, setIndex] = useState(0);
  const step = steps[index % steps.length]!;
  useEffect(() => {
    const timer = setTimeout(() => setIndex((value) => value + 1), step.ms);
    return () => clearTimeout(timer);
  }, [index, step.ms]);
  const phase = step.phase === "attending" ? "rest" : step.phase;
  return (
    <span data-step={index} data-step-state={`${step.phase}${step.scene ? "-" + step.scene : ""}`} data-step-act="">
      {desk ? (
        <SecretaryDesk attending={step.phase === "attending"} count={0} tone="var(--warn)" label="Секретарь" scene={step.scene} phase={phase} onTap={() => {}} />
      ) : (
        <SecretaryMascot scene={step.scene} phase={phase} size={128} />
      )}
    </span>
  );
}

/**
 * /dev/idle — the waiting screen's two living things alone, placed as Пульс places them: the face
 * at 128 px and the secretary's desk right of it (dev only). A frame budget is measured here
 * without a login and without the rest of the board (D-126 §13), and the switches of the face are
 * filmed here (`seq`).
 *   ?face=calm|sleeping|alert|working|…|none   the face's state (default calm)
 *   ?desk=rest|asked|attending|doing-<scene>|done-<scene>|none   the desk (default rest)
 *   ?seq=calm:2000,listening:1500,…            the face walks through these steps instead
 *   ?sec=rest:2000,asked-coffee:1500,…         the secretary's own face walks through its phases
 *   ?deskseq=rest:2000,attending:1200,…        the director's desk does
 */
export default function IdlePage() {
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => null,
  );
  if (search === null) return null;
  const query = new URLSearchParams(search);
  const face = (query.get("face") ?? "calm") as MascotState | "none";
  const seq = query.get("seq");
  const sec = query.get("sec");
  const deskSeq = query.get("deskseq");
  const desk = query.get("desk") ?? (seq || sec || deskSeq ? "none" : "rest");
  const [phase, scene] = desk.split("-") as [DeskPhase | "attending" | "none", DeskScene | undefined];
  return (
    <main className="relative mx-auto h-[844px] w-[390px] overflow-hidden" data-idle-bench>
      <div className="absolute left-1/2 top-[380px] flex h-[152px] w-[152px] -translate-x-1/2 -translate-y-1/2 items-center justify-center">
        {sec || deskSeq ? (
          <SecSequence steps={parseSecSeq((sec ?? deskSeq)!)} desk={Boolean(deskSeq)} />
        ) : seq ? (
          <Sequence steps={parseSeq(seq)} />
        ) : face === "none" ? null : (
          <Mascot state={face} size={128} carry={face === "working" ? { count: 2 } : null} />
        )}
        {phase === "none" ? null : (
          <div className="absolute left-1/2 top-1/2" style={{ marginLeft: DESK_AT.x, marginTop: DESK_AT.y, width: DESK_W, height: DESK_H }}>
            <SecretaryDesk
              attending={phase === "attending"}
              count={phase === "asked" ? 1 : 0}
              tone="var(--warn)"
              label="Секретарь"
              scene={scene ?? (phase === "asked" ? "coffee" : null)}
              phase={phase === "attending" ? "rest" : phase}
              onTap={() => {}}
            />
          </div>
        )}
      </div>
    </main>
  );
}
