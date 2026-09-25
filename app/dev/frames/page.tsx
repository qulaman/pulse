"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { ACT_MS, Mascot, type MascotAct, type MascotState } from "@/components/brand/Mascot";
import { SecretaryDesk } from "@/components/pulse/SecretaryDesk";
import { FINISH_MS, SEC_ACT_MS, SecretaryMascot, type SecretaryAct } from "@/components/secretary/SecretaryMascot";
import { DESK_SCENES, type Daypart, type DeskPhase, type DeskScene, type Urgency } from "@/lib/errands/scene";
import type { MascotSeason } from "@/lib/mascot/season";

/**
 * /dev/frames — contact sheets of the mascots (dev only). Every row is one motion drawn as a
 * strip of frames: the same component, mounted once per column; once mounted, every animation of
 * column k is paused and seeked to k/(n−1) of the row's length (`data-dur`, ms). Nothing here runs
 * on its own clock, so a screenshot of a row is the whole motion at a glance — a hand that stays
 * on the desk while the arms go up shows in one picture.
 *
 *   ?set=drop-states | drop-acts | sec | desk | transitions   which rows (transitions: the face
 *                                               mounts in one state and turns to the next at once —
 *                                               the columns are the moments after the turn)
 *   ?only=<row key>[,<row key>…]                just these rows
 *   ?n=8                                        frames per row
 *   ?size=96                                    the face's size; the cells grow with it
 *   ?live                                       let everything play instead
 * Once every column is held, `main[data-ready]` is set — `pnpm smoke:mascot` waits for it. The
 * static frames of «уменьшить движение» are the same page under an emulated
 * `prefers-reduced-motion: reduce` (DevTools → Rendering, or `REDUCED=1 pnpm smoke:mascot`).
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
  // the director's face answers the board (tasks/020)
  tick: { on: "calm" },
  receive: { on: "calm" },
  hmm: { on: "calm" },
  puzzle: { on: "calm" },
  stamp: { on: "calm" },
  flick: { on: "calm" },
  crumple: { on: "calm" },
  push: { on: "calm" },
  clock: { on: "calm" },
  reply: { on: "calm" },
  // a phrase that did not make it (tasks/020, phase B)
  ear: { on: "calm" },
  scratch: { on: "calm" },
  pinch: { on: "calm" },
  nomic: { on: "calm" },
  signal: { on: "calm" },
};

function dropStates(size: number): Row[] {
  const seasons = (["new_year", "nauryz"] as const).flatMap((season) =>
    (["calm", "sleeping", "working"] as MascotState[]).map((state) => ({
      key: `season-${season}-${state}`,
      label: `${state} · ${season}`,
      dur: LOOP_MS[state],
      w: size * 1.7,
      h: size * 1.7,
      draw: () => <Mascot state={state} size={size} carry={CARRY[state] ?? null} season={season} />,
    })),
  );
  return [...seasons, ...(Object.keys(LOOP_MS) as MascotState[]).map((state) => ({
    key: `state-${state}`,
    label: state,
    dur: LOOP_MS[state],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={state} size={size} carry={CARRY[state] ?? null} />,
  }))];
}

/** Acts whose hands meet the employee's stack: the free hand must be the one that moves. */
const HOLDING: [MascotAct, MascotState][] = [
  ["wave", "working"],
  ["shrug", "working"],
  ["poof", "working"],
];

/**
 * The director's board acts over the faces they also meet (tasks/020): on «Задачи» the card lies on
 * the clipboard and the pencil is put down; on the watchful face the props must clear its ear.
 */
const BOARD_ON: [MascotAct, MascotState][] = [
  ["receive", "checking"],
  ["hmm", "checking"],
  ["stamp", "checking"],
  ["flick", "checking"],
  ["crumple", "checking"],
  ["push", "checking"],
  ["clock", "checking"],
  ["reply", "checking"],
  ["tick", "alert"],
  ["puzzle", "alert"],
  ["clock", "alert"],
  // the failures of the pipeline on the watchful face: its ear on the crown meets the arms
  ["ear", "alert"],
  ["nomic", "alert"],
  ["signal", "alert"],
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
  const board = BOARD_ON.map(([act, on]) => ({
    key: `act-${act}-${on}`,
    label: `${act} · ${on}`,
    dur: ACT_MS[act],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={on} size={size} act={act} />,
  }));
  // the director's rows go last: a row inserted above the others shifts them by a fraction of a
  // pixel, and the smoke's pixel compare reads the new antialiasing as a change
  return [...holding, ...(Object.keys(ACT_ON) as MascotAct[]).map((act) => ({
    key: `act-${act}`,
    label: `${act} · ${ACT_ON[act].on}`,
    dur: ACT_MS[act],
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Mascot state={ACT_ON[act].on} size={size} act={act} carry={ACT_ON[act].carry ?? null} />,
  })), ...board];
}

type SecCell = {
  scene?: DeskScene | null;
  phase: DeskPhase;
  act?: SecretaryAct;
  urgency?: Urgency;
  daypart?: Daypart;
  talking?: boolean;
  bare?: boolean;
  mini?: boolean;
  room?: boolean;
  still?: boolean;
  season?: MascotSeason;
};

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
        still={cell.still ?? false}
        season={cell.season ?? null}
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
  const reading = secRow(size, "sec-rest-still", "rest, deep rest: reads", 3400, { phase: "rest", still: true });
  const seasons = [
    secRow(size, "sec-season-new_year", "rest · new_year", 3400, { phase: "rest", season: "new_year" }),
    secRow(size, "sec-season-nauryz", "asked · nauryz", 1900, { scene: "tea", phase: "asked", season: "nauryz" }),
  ];
  return [...dayparts, reading, ...seasons, ...acts, ...asked, alarm, ...doing, ...done, ...mini, talking];
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

/** One face that mounts showing `from` and turns into `to` on the next frame. */
function Turn({ from, to }: { from: ReactNode; to: ReactNode }) {
  const [on, setOn] = useState(false);
  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => setOn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return <>{on ? to : from}</>;
}

/**
 * What goes when a face changes its mind: the ball closes, the stack becomes the hourglass, the
 * request is taken, the job is done. Every prop has to leave, not blink out.
 */
function transitions(size: number): Row[] {
  const drop = (key: string, from: [MascotState, { count: number }?], to: [MascotState, { count: number }?]): Row => ({
    key: `turn-${key}`,
    label: `${from[0]} → ${to[0]}`,
    dur: 600,
    w: size * 1.7,
    h: size * 1.7,
    draw: () => <Turn from={<Mascot state={from[0]} size={size} carry={from[1] ?? null} />} to={<Mascot state={to[0]} size={size} carry={to[1] ?? null} />} />,
  });
  const sec = (key: string, from: SecCell, to: SecCell): Row => ({
    key: `turn-${key}`,
    label: `sec ${from.phase} ${from.scene ?? ""} → ${to.phase} ${to.scene ?? ""}`,
    dur: 600,
    w: size * 2.3,
    h: size * 1.75,
    draw: () => (
      <Turn
        from={<SecretaryMascot scene={from.scene ?? null} phase={from.phase} size={size} />}
        to={<SecretaryMascot scene={to.scene ?? null} phase={to.phase} size={size} />}
      />
    ),
  });
  return [
    drop("checking-calm", ["checking"], ["calm"]),
    drop("serving-calm", ["serving"], ["calm"]),
    drop("announcing-calm", ["announcing"], ["calm"]),
    drop("scheduling-calm", ["scheduling"], ["calm"]),
    drop("chatting-calm", ["chatting"], ["calm"]),
    drop("listening-saving", ["listening"], ["saving"]),
    drop("offering-sending", ["offering"], ["sending"]),
    drop("calling-working", ["calling", { count: 1 }], ["working", { count: 2 }]),
    drop("working-awaiting", ["working", { count: 1 }], ["awaiting"]),
    drop("awaiting-happy", ["awaiting"], ["happy"]),
    drop("nervous-working", ["nervous", { count: 1 }], ["working", { count: 1 }]),
    drop("alert-calm", ["alert"], ["calm"]),
    sec("rest-asked", { phase: "rest" }, { scene: "coffee", phase: "asked" }),
    sec("asked-doing", { scene: "coffee", phase: "asked" }, { scene: "coffee", phase: "doing" }),
    sec("doing-done", { scene: "coffee", phase: "doing" }, { scene: "coffee", phase: "done" }),
    sec("doing-done-tea", { scene: "tea", phase: "doing" }, { scene: "tea", phase: "done" }),
    sec("doing-done-print", { scene: "print", phase: "doing" }, { scene: "print", phase: "done" }),
    sec("doing-rest-dnd", { scene: "dnd", phase: "doing" }, { phase: "rest" }),
  ];
}

const SETS: Record<string, (size: number) => Row[]> = { "drop-states": dropStates, "drop-acts": dropActs, sec: secretary, desk, transitions };

/** The query string after hydration — a string snapshot, so the store stays stable. */
function useSearch(): string | null {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.search,
    () => null,
  );
}

export default function FramesPage() {
  const search = useSearch();
  // the rows are built once per query: the sheet seeks them once, not on every render
  const sheet = useMemo(() => {
    if (search === null) return null;
    const query = new URLSearchParams(search);
    const set = SETS[query.get("set") ?? "drop-states"] ?? dropStates;
    const only = query.get("only");
    const size = Number(query.get("size") ?? "96") || 96;
    return {
      rows: set(size).filter((row) => !only || only.split(",").includes(row.key)),
      n: Math.max(2, Number(query.get("n") ?? "8") || 8),
      live: query.has("live"),
    };
  }, [search]);
  if (!sheet) return null;
  return <Sheet rows={sheet.rows} n={sheet.n} live={sheet.live} />;
}

function Sheet({ rows, n, live }: { rows: Row[]; n: number; live: boolean }) {
  const root = useRef<HTMLElement>(null);
  const [ready, setReady] = useState(false);
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
    // a prop mounted a few frames later (the sign of a job, the tick of a finish, the face that has
    // just turned) is caught by the next passes; after the last, «held» for a waiting script
    let frame = 0;
    let passes = 0;
    const pass = () => {
      seek();
      passes += 1;
      if (passes < 4) frame = requestAnimationFrame(pass);
      else setReady(true);
    };
    pass();
    return () => cancelAnimationFrame(frame);
  }, [rows, live]);
  return (
    <main ref={root} className="p-3" data-frames data-ready={ready || live ? "" : undefined}>
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
