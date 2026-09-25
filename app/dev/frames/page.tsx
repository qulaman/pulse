"use client";

import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { FINISH_MS, SEC_ACT_MS, SecretaryMascot, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import { DESK_SCENES, type Daypart, type DeskPhase, type DeskScene, type Urgency } from "@/lib/errands/scene";

/**
 * /dev/frames — contact sheets of the mascots (dev only). Every row is one motion drawn as a
 * strip of frames: the same component, mounted once per column; once mounted, every animation of
 * column k is paused and seeked to k/(n−1) of the row's length (`data-dur`, ms). Nothing here runs
 * on its own clock, so a screenshot of a row is the whole motion at a glance — a hand that stays
 * on the desk while the arms go up shows in one picture.
 *
 *   ?set=drop-states | drop-acts | sec | desk   which rows
 *   ?only=<row key>[,<row key>…]                just these rows
 *   ?n=8                                        frames per row
 *   ?size=96                                    the face's size; the cells grow with it
 *   ?live                                       let everything play instead
 */

type Row = { key: string; label: string; dur: number; draw: () => ReactNode; w: number; h: number };

/** One loop of each state's body motion (the length of BODY in Mascot.tsx), for the strip. */
const LOOP_MS: Record<MascotState, number> = {
  calm: 5800,
  listening: 1150,
  saving: 1400,
  transcribing: 2400,
  parsing: 2400,
  sending: 1200,
  offering: 1600,
  thinking: 2600,
  speaking: 1100,
  happy: 3800,
  sleeping: 7000,
  surprised: 2800,
  processing: 1900,
  calling: 1900,
  alert: 4600,
  angry: 820,
  nervous: 1350,
  bored: 4400,
  panicking: 480,
  swearing: 720,
  checking: 3600,
  chatting: 3200,
  announcing: 1400,
  scheduling: 3000,
  serving: 3200,
  celebrating: 3800,
  working: 6400,
  awaiting: 5000,
  tuned: 1800,
};

const CARRY: Partial<Record<MascotState, { count: number; hot?: boolean }>> = {
  working: { count: 3 },
  panicking: { count: 2, hot: true },
  calling: { count: 1 },
  nervous: { count: 1 },
};

/** Each act on a state it is played over in the product (useMascotActs pools, D-110 events). */
const ACT_ON: Record<MascotAct, { on: MascotState; carry?: { count: number; hot?: boolean } }> = {
  yawn: { on: "sleeping" },
  snore: { on: "sleeping" },
  turn: { on: "sleeping" },
  doze: { on: "sleeping" },
  mumble: { on: "sleeping" },
  smile: { on: "sleeping" },
  kick: { on: "sleeping" },
  wave: { on: "calm" },
  wink: { on: "calm" },
  hop: { on: "calm" },
  spin: { on: "calm" },
  whistle: { on: "calm" },
  heart: { on: "calm" },
  orbit: { on: "calm" },
  peek: { on: "alert" },
  tiptoe: { on: "alert" },
  catch: { on: "calling" },
  insist: { on: "calling" },
  nod: { on: "working", carry: { count: 2 } },
  raise: { on: "working", carry: { count: 1 } },
  shrug: { on: "happy" },
  poof: { on: "happy" },
  handover: { on: "awaiting" },
  medal: { on: "happy" },
  boomerang: { on: "calling" },
  relief: { on: "working", carry: { count: 1 } },
  letter: { on: "nervous", carry: { count: 1 } },
  read: { on: "working", carry: { count: 1 } },
  listen: { on: "happy" },
  thumb: { on: "tuned" },
  watch: { on: "working", carry: { count: 2 } },
  wipe: { on: "working", carry: { count: 2 } },
  shuffle: { on: "working", carry: { count: 3 } },
  coin: { on: "happy" },
};

function dropStates(size: number): Row[] {
  return (Object.keys(LOOP_MS) as MascotState[]).map((state) => ({
    key: `state-${state}`,
    label: state,
    dur: LOOP_MS[state],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={state} size={size} carry={CARRY[state] ?? null} />,
  }));
}

/** Acts whose hands meet the employee's stack: the free hand must be the one that moves. */
const HOLDING: [MascotAct, MascotState][] = [
  ["wave", "working"],
  ["shrug", "working"],
  ["poof", "working"],
];

function dropActs(size: number): Row[] {
  const holding = HOLDING.map(([act, on]) => ({
    key: `act-${act}-holding`,
    label: `${act} · ${on} + stack`,
    dur: ACT_MS[act],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={on} size={size} act={act} carry={{ count: 2 }} />,
  }));
  return [...holding, ...(Object.keys(ACT_ON) as MascotAct[]).map((act) => ({
    key: `act-${act}`,
    label: `${act} · ${ACT_ON[act].on}`,
    dur: ACT_MS[act],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={ACT_ON[act].on} size={size} act={act} carry={ACT_ON[act].carry ?? null} />,
  }))];
}

type SecCell = { scene?: DeskScene | null; phase: DeskPhase; act?: SecretaryAct; urgency?: Urgency; daypart?: Daypart; talking?: boolean; bare?: boolean; mini?: boolean; room?: boolean };

function secRow(size: number, key: string, label: string, dur: number, cell: SecCell): Row {
  return {
    key,
    label,
    dur,
    w: size * 2.3,
    h: size * 1.75,
    draw: () => (
      <SecretaryMascot
        scene={cell.scene ?? null}
        phase={cell.phase}
        act={cell.act ?? null}
        urgency={cell.urgency ?? 0}
        daypart={cell.daypart ?? "day"}
        talking={cell.talking ?? false}
        bare={cell.bare ?? false}
        mini={cell.mini ?? false}
        room={cell.room}
        size={size}
      />
    ),
  };
}

function secretary(size: number): Row[] {
  const acts = (Object.keys(SEC_ACT_MS) as SecretaryAct[]).map((act) => secRow(size, `sec-act-${act}`, `act ${act}`, SEC_ACT_MS[act], { phase: "rest", act }));
  const dayparts = (["morning", "day", "evening", "night"] as Daypart[]).map((daypart) => secRow(size, `sec-rest-${daypart}`, `rest ${daypart}`, 3400, { phase: "rest", daypart }));
  const asked = ([0, 1, 2] as Urgency[]).map((urgency) => secRow(size, `sec-asked-${urgency}`, `asked u${urgency}`, 1900, { scene: "coffee", phase: "asked", urgency }));
  const alarm = secRow(size, "sec-asked-security", "asked security", 1200, { scene: "security", phase: "asked", urgency: 2 });
  const doing = DESK_SCENES.map((scene) => secRow(size, `sec-doing-${scene}`, `doing ${scene}`, 4200, { scene, phase: "doing" }));
  const done = DESK_SCENES.map((scene) => secRow(size, `sec-done-${scene}`, `done ${scene}`, FINISH_MS, { scene, phase: "done" }));
  const mini = DESK_SCENES.map((scene) => secRow(size, `sec-mini-${scene}`, `mini ${scene}`, 3200, { scene, phase: "doing", mini: true }));
  const talking = secRow(size, "sec-talking", "bare talking", 1100, { phase: "rest", bare: true, talking: true });
  return [...dayparts, ...acts, ...asked, alarm, ...doing, ...done, ...mini, talking];
}

type DeskCell = { scene?: DeskScene | null; phase?: DeskPhase; attending?: boolean; urgency?: Urgency };

function desk(): Row[] {
  const cells: [string, DeskCell, number][] = [
    ["rest", { scene: null, phase: "rest" }, 1900],
    ["asked", { scene: "coffee", phase: "asked", urgency: 1 }, 1900],
    ["attending", { scene: null, phase: "rest", attending: true }, 1000],
    ["done coffee", { scene: "coffee", phase: "done" }, 2200],
    ...DESK_SCENES.map((scene): [string, DeskCell, number] => [`doing ${scene}`, { scene, phase: "doing" }, 3200]),
  ];
  return cells.map(([label, cell, dur]) => ({
    key: `desk-${label.replace(/\s+/g, "-")}`,
    label: `desk ${label}`,
    dur,
    w: 200,
    h: 130,
    draw: () => (
      <SecretaryDesk attending={cell.attending ?? false} count={0} tone="var(--warn)" label="" scene={cell.scene ?? null} phase={cell.phase ?? "rest"} urgency={cell.urgency ?? 0} onTap={() => {}} />
    ),
  }));
}

const SETS: Record<string, (size: number) => Row[]> = { "drop-states": dropStates, "drop-acts": dropActs, sec: secretary, desk };

/** The query string after hydration — a string snapshot, so the store stays stable. */
function useQuery(): URLSearchParams | null {
  const search = useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => null,
  );
  return search === null ? null : new URLSearchParams(search);
}

export default function FramesPage() {
  const query = useQuery();
  if (!query) return null;
  const set = SETS[query.get("set") ?? "drop-states"] ?? dropStates;
  const only = query.get("only");
  const n = Math.max(2, Number(query.get("n") ?? "8") || 8);
  const size = Number(query.get("size") ?? "96") || 96;
  const rows = set(size).filter((row) => !only || row.key === only || only.split(",").includes(row.key));
  return <Sheet rows={rows} n={n} live={query.has("live")} />;
}

function Sheet({ rows, n, live }: { rows: Row[]; n: number; live: boolean }) {
  const root = useRef<HTMLElement>(null);
  // hold every column at its own moment of the row's timeline (the Web Animations API seeks CSS
  // animations too; their delays stay authored, so staggered props keep their stagger)
  useEffect(() => {
    if (live || !root.current) return;
    const frames = root.current.querySelectorAll<HTMLElement>("[data-frame]");
    const seek = () => {
      for (const frame of frames) {
        const t = Number(frame.dataset.t);
        for (const anim of frame.getAnimations({ subtree: true })) {
          anim.pause();
          anim.currentTime = t;
        }
      }
    };
    // a prop mounted a frame later (the sign of a job, the tick of a finish) is caught by the second pass
    seek();
    const again = requestAnimationFrame(seek);
    return () => cancelAnimationFrame(again);
  }, [rows, live]);
  return (
    <main ref={root} className="p-3" data-frames>
      {rows.map((row) => (
        <section key={row.key} data-row={row.key} data-dur={row.dur} className="mb-1 flex items-center gap-1 border-b border-border">
          <p className="w-[110px] shrink-0 text-[11px] leading-3 text-muted">
            {row.label}
            <br />
            <span className="nums">{row.dur} мс</span>
          </p>
          {Array.from({ length: n }, (_, k) => (
            <div
              key={k}
              data-frame={k}
              data-t={((row.dur * k) / (n - 1)).toFixed(0)}
              className="relative flex shrink-0 items-center justify-center overflow-hidden"
              style={{ width: row.w, height: row.h }}
            >
              {row.draw()}
              <span className="nums absolute left-1 top-0.5 text-[10px] text-muted">{((row.dur * k) / (n - 1) / 1000).toFixed(2)}</span>
            </div>
          ))}
        </section>
      ))}
    </main>
  );
}
