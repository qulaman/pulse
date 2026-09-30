import type { ReactNode } from "react";

import { Blend, EYE_BLEND, SETTLE_LEAD } from "@/components/brand/Blend";
import { FADE_OUT, Linger } from "@/components/brand/Linger";
import { SeasonWear } from "@/components/brand/MascotSeason";
import type { MascotSeason } from "@/lib/mascot/season";
import type { Daypart, DeskPhase, DeskScene, Urgency } from "@/lib/errands/scene";

import {
  Arm,
  Bubble,
  Car,
  Carried,
  CoffeeMachine,
  Confetti,
  EDGE,
  GEAR,
  Glyph,
  GuestDoor,
  Hearts,
  Hush,
  MeetingTable,
  Notepad,
  PourCup,
  Pourer,
  Printer,
  RoomBack,
  RoomFront,
  SECRETARY_TONE,
  ShutDoor,
  Sign,
  SignArm,
  Siren,
  TEA,
  TypingHands,
  WATER,
  Writing,
} from "./secretaryRoom";

import "./secretary-mascot.css";

export { SECRETARY_TONE } from "./secretaryRoom";

/**
 * The one-shots of the secretary's face (D-97): «есть!» on «Принял», the small things done at
 * the desk while nobody asks, the morning arrival, the director's «спасибо».
 */
export type SecretaryAct =
  | "accept"
  | "sip"
  | "headset"
  | "headsetRight"
  | "stretch"
  | "stretchSide"
  | "clock"
  | "papers"
  | "plant"
  | "arrive"
  | "thanks";

/** How long each act takes: the screen clears it after this, the keyframes are cut to it. */
export const SEC_ACT_MS: Record<SecretaryAct, number> = {
  accept: 900,
  sip: 2600,
  headset: 2200,
  // the same small things another way: the other hand, a stretch to the side — so a day at the
  // desk does not repeat one take
  headsetRight: 2200,
  stretch: 2400,
  stretchSide: 2400,
  clock: 2200,
  papers: 2000,
  plant: 2800,
  arrive: 2600,
  thanks: 2600,
};

/** How long the finish after «Готово» plays (the carry-out keyframes are cut to it). */
export const FINISH_MS = 2_200;

const EYE_RX = 6.6;
const EYE_RY = 7;
const LOOK_EASE = "transform 420ms cubic-bezier(0.34, 1.45, 0.64, 1)";
const SHAPE_EASE = "transform 160ms var(--ease-out)";
const IDLE = "mascot-idle 5.8s cubic-bezier(0.45, 0, 0.55, 1) infinite";
/** A piece of the job's room that is no longer needed steps back the way it came (PROP_IN). */
const SMC_OUT = "smc-env-out 0.26s ease-in both";

type Look = { x: number; y: number; loop?: string };

/** Where the eyes are while the job runs: on the machine, on the cup, on the door, on you. */
const LOOK: Record<DeskScene, Look> = {
  coffee: { x: -3.4, y: -0.6 },
  tea: { x: -3, y: 1.6 },
  water: { x: -3, y: 1.6 },
  dnd: { x: 1.2, y: 0.2 },
  security: { x: 0, y: -0.4, loop: "mascot-scan 1.6s ease-in-out infinite" },
  guest: { x: 0, y: 0, loop: "smc-guest-look 4.2s ease-in-out infinite" },
  meeting: { x: -3.4, y: 1.2 },
  doctor: { x: 1.4, y: -0.6 },
  come: { x: -3.2, y: 0 },
  taxi: { x: -3.4, y: 0.8 },
  print: { x: -3.4, y: 0.2 },
  lunch: { x: -2.4, y: 0 },
  courier: { x: -2.4, y: 0 },
  other: { x: 2.2, y: 2.2 },
};

/** The body's own motion under each job. */
const BODY: Record<DeskScene, string> = {
  coffee: "mascot-serve 3.2s ease-in-out infinite",
  tea: "smc-pour-body 3.2s ease-in-out infinite",
  water: "smc-pour-body 3.2s ease-in-out infinite",
  dnd: "smc-guard 4.2s ease-in-out infinite",
  // on the phone to the guards, fast
  security: "mascot-talk 0.7s ease-in-out infinite",
  guest: "smc-invite 4.2s ease-in-out infinite",
  meeting: "mascot-serve 3.2s ease-in-out infinite",
  doctor: "mascot-talk 1.1s ease-in-out infinite",
  come: "smc-walk 0.56s ease-in-out infinite",
  taxi: "mascot-talk 1.1s ease-in-out infinite",
  print: IDLE,
  lunch: "smc-walk 0.56s ease-in-out infinite",
  courier: "smc-walk 0.56s ease-in-out infinite",
  other: IDLE,
};

/** The finishes that carry the job out of the frame and come back empty-handed. */
const CARRY_OUT: ReadonlySet<DeskScene> = new Set(["coffee", "tea", "water", "lunch", "courier", "print", "come"]);

/** What an idle act does to the body and to the eyes. */
const ACT_BODY: Partial<Record<SecretaryAct, string>> = {
  accept: "smc-nod 0.9s cubic-bezier(0.34, 1.4, 0.64, 1) both",
  stretch: "smc-stretch 2.4s ease-in-out both",
  arrive: "smc-arrive 2.6s cubic-bezier(0.3, 0.7, 0.3, 1) both",
  // the head leans into the hand that sets the headset right
  headset: "smc-tilt-ear 2.2s ease-in-out both",
  headsetRight: "smc-tilt-ear-r 2.2s ease-in-out both",
  stretchSide: "smc-stretch-side 2.4s ease-in-out both",
};
/** The eyes go first: to the mug, to the ear, up — and only then the hand. */
const ACT_EYES: Partial<Record<SecretaryAct, string>> = {
  sip: "smc-look-mug 2.6s ease-in-out both",
  headset: "smc-look-ear 2.2s ease-in-out both",
  headsetRight: "smc-look-ear-r 2.2s ease-in-out both",
  stretch: "smc-look-stretch 2.4s ease-in-out both",
  stretchSide: "smc-look-stretch 2.4s ease-in-out both",
  clock: "smc-look-clock 2.2s ease-in-out both",
  papers: "smc-look-papers 2s ease-in-out both",
  plant: "smc-look-plant 2.8s ease-in-out both",
};
const ACT_LIDS: Partial<Record<SecretaryAct, string>> = {
  sip: "smc-lids-shut 2.6s ease-in-out both",
  stretch: "smc-lids-shut 2.4s ease-in-out both",
  stretchSide: "smc-lids-shut 2.4s ease-in-out both",
};

/**
 * The secretary's own face (D-87, D-97): the same soft blob as «Капля», in the secretary's
 * deeper teal, with a headset, a bow tie and a gleam in each eye — the receptionist of the
 * family. Its body shows the director's request in hand:
 *   rest    at the desk: typing, the window behind shows the time of day, a clock on the wall,
 *           a mug, papers and a plant; now and then an act — a sip, the headset set right, a
 *           stretch, a look at the clock, the papers squared, the plant watered; at night
 *           (outside the delivery window) the secretary dozes at the desk
 *   asked   a request nobody took: the headset rings, the face hops, the request floats over
 *           the head as a picture with «+N» for the ones behind it; the longer it waits the
 *           harder it calls — faster, the bubble shaking, then running on the spot
 *   doing   the job — coffee, tea, water, the «не беспокоить» sign at the director's shut door,
 *           the guest's door, a meeting room, a call to the doctor or for a car, the printer,
 *           lunch or a parcel carried, off to the director, a note taken
 *   done    the finish after «Готово»: the cup carried out, the door shut, the sign put away,
 *           the car gone — then a tick
 * `bare` drops the room and the job (the face is talking while the balls are out); `mini` is
 * the small secretary at the director's desk: no room, the job in its hands only. Perf
 * contract of the mascot: one SVG, transform and opacity only, CSS keyframes.
 */
export function SecretaryMascot({
  scene,
  phase,
  size = 128,
  talking = false,
  bare = false,
  mini = false,
  act = null,
  urgency = 0,
  queue = 0,
  daypart = "day",
  look = null,
  cheer = false,
  still = false,
  season = null,
  room: roomOn,
}: {
  scene: DeskScene | null;
  phase: DeskPhase;
  size?: number;
  talking?: boolean;
  bare?: boolean;
  mini?: boolean;
  act?: SecretaryAct | null;
  urgency?: Urgency;
  queue?: number;
  daypart?: Daypart;
  /** where the eyes go and hold, −1..1 on each axis (the desk turned to the director's face) */
  look?: { x: number; y: number } | null;
  /** a quick job was just closed — confetti (the caller asks only after the D-40 gate) */
  cheer?: boolean;
  /**
   * The deep rest of a screen nobody has touched for minutes (D-119): at the desk the secretary
   * stops typing and reads — the body sits still, the eyes stay on the monitor, the room's clouds,
   * stars, steam and plant stop; the clock ticks on. Anything asked of the secretary ends it.
   */
  still?: boolean;
  /** a holiday of the company's calendar to dress for (D-119) — over the headset band */
  season?: MascotSeason | null;
  /**
   * The room of the job even in `mini` (D-103): the small secretary at the director's desk
   * stands up to the coffee machine, the teapot, the door — the director sees the job itself.
   */
  room?: boolean;
}) {
  // below avatar size the room and the props are noise: the body and the headset still read
  const detailed = size >= 40;
  const room = detailed && !bare && (roomOn ?? !mini);
  const rest = !bare && phase === "rest";
  const asleep = rest && daypart === "night";
  // reading at the desk: an untouched screen, at rest, between the small acts
  const reading = rest && still && !asleep && !act;
  const stretching = act === "stretch" || act === "stretchSide";
  // eyes that turn to somebody new blink on the way (the key remounts the lid group per target)
  const lookKey = look ? `${Math.round(look.x * 3)}:${Math.round(look.y * 3)}` : "own";
  const job: DeskScene | null = !bare && phase === "doing" ? scene : null;
  const asked = !bare && phase === "asked";
  const done = !bare && phase === "done";
  const show = (what: DeskScene) => detailed && job === what;
  const inRoom = (what: DeskScene) => room && job === what;
  const finish = done && scene ? scene : null;
  const glad = done || act === "thanks";
  // «вызови охрану» (D-99): a siren on the head while it calls and while the guards are called
  const alarm = scene === "security" && (asked || job === "security");

  const base: Look = look
    ? { x: look.x * 4, y: look.y * 3 }
    : bare || talking
      ? { x: 0, y: 0 }
      : asleep
        ? { x: 0, y: 1 }
        : rest && !mini
          ? { x: 2.6, y: 1.2, loop: "smc-desk-look 7s ease-in-out infinite" }
          : job
            ? LOOK[job]
            : { x: 0, y: 0 };
  const eyeLoop = (act && ACT_EYES[act]) ?? base.loop ?? "none";
  const eye = asleep
    ? "scale(0.9, 0.16)"
    : glad
      ? "scale(0.85, 0.42)"
      : asked || alarm
        ? `scale(1.1, ${urgency === 2 || alarm ? 1.2 : 1.14})`
        : job === "dnd"
          ? "scale(0.95, 0.6)"
          : "scale(1, 1)";
  const blink = glad || asleep ? "none" : "mascot-blink 9.2s infinite";
  const lids = act ? ACT_LIDS[act] : undefined;
  const settle = asked ? "mascot-settle 0.22s cubic-bezier(0.16, 1, 0.3, 1) both" : "none";

  const body = talking
    ? "mascot-talk 1.1s ease-in-out infinite"
    : asked
      ? urgency === 2 || alarm
        ? "smc-run 0.36s ease-in-out infinite"
        : `mascot-call ${urgency === 1 ? "1.25s" : "1.9s"} cubic-bezier(0.3, 0, 0.2, 1) infinite`
      : done
        ? finish === "guest"
          ? "mascot-bow 0.8s cubic-bezier(0.34, 1.2, 0.64, 1) both"
          : "mascot-happy 3.8s cubic-bezier(0.45, 0, 0.55, 1) infinite"
        : job
          ? BODY[job]
          : asleep
            ? "mascot-sleep 7s ease-in-out infinite"
            : rest
              ? act === "arrive"
                ? "smc-walk 0.52s ease-in-out 3"
                : reading
                  ? "none"
                  : "smc-type 3.36s ease-in-out infinite"
              : IDLE;
  // the outer motion: an act moves the whole body; the finish carries the job out and back
  // (the director's desk walks its small secretary over to the big face instead — SecretaryDesk)
  const outer = act && ACT_BODY[act] ? ACT_BODY[act] : finish && CARRY_OUT.has(finish) && !mini ? `smc-carry-out ${FINISH_MS}ms ease-in-out both` : "none";

  const danger = (asked && urgency === 2) || alarm;
  const ringTone = danger ? "var(--danger)" : "var(--warn)";
  const lightTone = act === "accept" ? "var(--ok)" : asked || alarm ? ringTone : talking || job === "doctor" || job === "taxi" ? "var(--ok)" : "var(--accent)";
  const lightLoop = asked || alarm
    ? `smc-light ${danger ? "0.3s" : "0.6s"} steps(1) infinite`
    : talking || job === "doctor" || job === "taxi"
      ? "smc-light 1.1s steps(1) infinite"
      : "smc-glow 3.4s ease-in-out infinite";
  const bubbleMotion = urgency === 2 || alarm ? "smc-shake 0.3s ease-in-out infinite" : urgency === 1 ? "smc-shake 0.5s ease-in-out infinite" : "smc-bubble 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      aria-hidden
      className="mascot"
      data-secretary
      data-scene={scene ?? "none"}
      data-phase={bare ? "bare" : phase}
      data-act={act ?? undefined}
      data-urgency={asked ? urgency : undefined}
      style={{ overflow: "visible", display: "block" }}
    >
      {room ? null : <ellipse cx="32" cy="61" rx="16" ry="2.5" fill="var(--bg)" opacity="0.5" />}

      {/* ---- the room behind the body ---- */}
      <Linger show={room && rest} out={FADE_OUT}>
        {room && rest ? <RoomBack daypart={daypart} clockAct={act === "clock"} still={reading} /> : null}
      </Linger>
      <Linger show={inRoom("coffee")} out={SMC_OUT} origin="100% 100%">
        {inRoom("coffee") ? <CoffeeMachine /> : null}
      </Linger>
      <Linger show={inRoom("guest")} out={SMC_OUT} origin="100% 100%">
        {inRoom("guest") ? <GuestDoor /> : null}
      </Linger>
      {room && finish === "guest" ? <GuestDoor closing /> : null}
      <Linger show={inRoom("tea")} out={SMC_OUT} origin="100% 100%">
        {inRoom("tea") ? <PourCup liquid={TEA} tag /> : null}
      </Linger>
      <Linger show={inRoom("water")} out={SMC_OUT} origin="100% 100%">
        {inRoom("water") ? <PourCup liquid={WATER} tag={false} /> : null}
      </Linger>
      <Linger show={inRoom("dnd") || (room && finish === "dnd")} out={SMC_OUT} origin="100% 100%">
        {inRoom("dnd") || (room && finish === "dnd") ? <ShutDoor /> : null}
      </Linger>
      <Linger show={show("dnd")}>
        {show("dnd") ? <Sign /> : null}
      </Linger>
      {detailed && finish === "dnd" ? <Sign away /> : null}
      <Linger show={inRoom("taxi")} out={SMC_OUT} origin="100% 100%">
        {inRoom("taxi") ? <Car /> : null}
      </Linger>
      {room && finish === "taxi" ? <Car motion="leave" /> : null}
      <Linger show={inRoom("print")} out={SMC_OUT} origin="100% 100%">
        {inRoom("print") ? <Printer /> : null}
      </Linger>
      <Linger show={inRoom("meeting")} out={SMC_OUT} origin="100% 100%">
        {inRoom("meeting") ? <MeetingTable /> : null}
      </Linger>

      {/* asked: the headset rings — arcs go out of the left ear, faster the longer it waits */}
      {asked && detailed ? (
        <g fill="none" stroke={ringTone} strokeWidth="1.4" strokeLinecap="round">
          {["M0 25.5 Q-3.5 31 0 36.5", "M-4.2 22 Q-9.4 31 -4.2 40"].map((d, i) => (
            <path
              key={d}
              d={d}
              style={{
                transformBox: "fill-box",
                transformOrigin: "100% 50%",
                animation: `smc-ring ${urgency === 2 ? "0.6s" : urgency === 1 ? "0.85s" : "1.2s"} ease-out ${i * 0.3}s infinite`,
                opacity: 0,
              }}
            />
          ))}
        </g>
      ) : null}

      {/* the body: every motion rides these groups, the props in hand ride with them; a motion cut by
          a new phase (a hop in the air when the request is taken) is carried back to rest, not snapped */}
      <Blend k={detailed ? outer : ""} origin="32px 58px">
      <g style={{ transformOrigin: "32px 58px", animation: outer }}>
        <Blend k={detailed ? settle : ""} origin="32px 52px" lead={SETTLE_LEAD}>
        <g
          style={{
            transformOrigin: "32px 52px",
            // dozing: the head sinks towards the desk and tips over
            transform: asleep ? "translateY(2.4px) rotate(7deg)" : undefined,
            transition: "transform 600ms var(--ease-out)",
            animation: settle,
          }}
        >
          <Blend k={detailed ? body : ""} origin="32px 44px">
          <g style={{ transformOrigin: "32px 44px", animation: body }}>
            {/* arms, drawn before the body so the body covers their roots */}
            {show("coffee") && room ? (
              <g style={{ animation: "smc-press 2.6s ease-in-out infinite" }}>
                <Arm d="M10 35 Q2 28 -3.5 24" hand={{ cx: -5.5, cy: 23, rx: 3.6, ry: 3 }} />
              </g>
            ) : null}
            {(show("tea") || show("water")) && room ? <Arm d="M10 38 Q3 34 -1 31" /> : null}
            {/* the sign is held up by the right hand; after «Готово» the hand lets go once it is put away */}
            {show("dnd") ? <SignArm style={{ transformOrigin: "52px 41px", animation: "smc-arm-in 0.45s cubic-bezier(0.34, 1.3, 0.64, 1) both" }} /> : null}
            {detailed && finish === "dnd" ? <SignArm style={{ animation: "smc-fade-out 0.3s ease-in 0.8s both" }} /> : null}
            {show("guest") ? <Arm d="M10 41 Q4 45 -1 43.5" hand={{ cx: -2.8, cy: 43, rx: 3.6, ry: 2.6 }} /> : null}
            {show("print") && room ? <Arm d="M10 36 Q2 33 -4 31" /> : null}
            {/* the hand brings the glass in and sets it down (in step with smc-place), then withdraws */}
            {show("meeting") && room ? <Arm d="M10 40 Q2 38 -6 37.5" style={{ animation: "smc-place-arm 2.6s ease-in-out infinite" }} /> : null}
            {/* the stretch: the hands leave the keys (TypingHands) and the arms go up over the head,
                out of the shoulders behind it */}
            {stretching && detailed ? (
              <>
                <g style={{ transformOrigin: "10px 40px", animation: "smc-arm-up 2.4s ease-in-out both" }}>
                  <Arm d="M10 40 Q-2 22 7 0" hand={{ cx: 7.4, cy: -2.6, rx: 3.8, ry: 4.2 }} />
                </g>
                <g style={{ transformOrigin: "54px 40px", animation: "smc-arm-up 2.4s ease-in-out both" }}>
                  <Arm d="M54 40 Q66 22 57 0" hand={{ cx: 56.6, cy: -2.6, rx: 3.8, ry: 4.2 }} />
                </g>
              </>
            ) : null}
            {act === "arrive" && detailed ? (
              // the bag of the morning, in the left hand; it goes under the desk
              <g style={{ animation: "smc-bag 2.6s ease-in-out both" }}>
                <path d="M-4 42 Q1 36 6 42" fill="none" stroke={GEAR} strokeWidth="1.4" />
                <rect x="-6" y="42" width="14" height="11" rx="2" fill={GEAR} stroke={EDGE} strokeWidth="0.7" />
                <Arm d="M10 40 Q5 40 2 40" />
              </g>
            ) : null}

            <path d="M32 4 C47 4 59 16 59 31 C59 47 47 60 32 60 C17 60 5 49 5 33 C5 18 17 4 32 4 Z" fill={SECRETARY_TONE} />
            {/* the tints of a still drawing are fill-opacity, here and in the room: «уменьшить движение»
                sets opacity 1 on everything around the body (globals.css) and made this gleam a white patch */}
            <ellipse cx="24" cy="18" rx="9" ry="5" fill="#ffffff" fillOpacity="0.14" />

            {/* the bow tie: the receptionist's sign, under the chin */}
            <g fill={GEAR}>
              <path d="M32 54.5 L25.6 51.2 Q24.6 54.5 25.6 57.8 Z" />
              <path d="M32 54.5 L38.4 51.2 Q39.4 54.5 38.4 57.8 Z" />
              <rect x="30.2" y="52.7" width="3.6" height="3.6" rx="1.2" />
            </g>

            {/* the headset: a band over the crown, two cups, the boom down to the mouth */}
            <path d="M8.6 29 C8.6 14.5 19 6.8 32 6.8 C45 6.8 55.4 14.5 55.4 29" fill="none" stroke={GEAR} strokeWidth="2.6" strokeLinecap="round" />
            <rect x="2.6" y="24.5" width="8" height="13" rx="3.4" fill={GEAR} stroke={EDGE} strokeWidth="0.7" />
            <rect x="53.4" y="24.5" width="8" height="13" rx="3.4" fill={GEAR} stroke={EDGE} strokeWidth="0.7" />
            <path d="M6.6 36.5 C7.6 45.5 13 49.6 21.5 49.2" fill="none" stroke={GEAR} strokeWidth="1.7" strokeLinecap="round" />
            <ellipse cx="23.2" cy="49.1" rx="2.6" ry="2" fill={GEAR} />
            <circle cx="6.6" cy="29" r="1.25" fill={lightTone} style={{ animation: asleep || reading ? "none" : lightLoop }} />
            {alarm && detailed ? <Siren /> : null}
            {/* a holiday on the crown; the siren takes the crown while it is on */}
            {season && detailed && !alarm ? <SeasonWear season={season} /> : null}

            {glad ? (
              <g fill="#ffffff" fillOpacity="0.22">
                <ellipse cx="16" cy="41" rx="4" ry="2" />
                <ellipse cx="48" cy="41" rx="4" ry="2" />
              </g>
            ) : null}

            {/* the eyes: one geometry, reshaped and moved by transform only */}
            <g style={{ transform: `translate(${base.x}px, ${base.y}px)`, transition: LOOK_EASE }}>
              <Blend k={detailed ? eyeLoop : ""} origin="32px 33px" timing={EYE_BLEND}>
              <g style={{ transformOrigin: "32px 33px", animation: eyeLoop }}>
                <g fill="var(--bg)">
                  {[24, 40].map((cx) => (
                    <g key={`${cx}-${lookKey}`} style={{ transformOrigin: `${cx}px 33px`, animation: look ? "mascot-blink-once 0.24s ease-in-out both" : "none" }}>
                    <g style={{ transformOrigin: `${cx}px 33px`, animation: blink }}>
                      <g style={{ transformOrigin: `${cx}px 33px`, animation: lids ?? "none" }}>
                        <g style={{ transformOrigin: `${cx}px 33px`, transform: eye, transition: SHAPE_EASE }}>
                          <ellipse cx={cx} cy="33" rx={EYE_RX} ry={EYE_RY} />
                          {/* a gleam in each eye: the secretary's own mark, and the eyes stay lively
                              instead of reading as two dark holes */}
                          {glad || asleep ? null : <circle cx={cx + 2.3} cy="30.2" r="1.8" fill="#ffffff" opacity="0.92" />}
                        </g>
                      </g>
                    </g>
                    </g>
                  ))}
                </g>
              </g>
              </Blend>
            </g>

            <Mouth talking={talking || job === "doctor" || job === "taxi" || job === "security"} asked={asked} alarm={alarm} glad={glad} job={job} rest={rest && !asleep} yawn={stretching} />

            {/* ---- what is held in front of the body ---- */}
            {show("dnd") ? <Hush /> : null}
            {show("come") ? <Notepad x={50} y={40} tilt={10} grip /> : null}
            {show("other") ? <Writing /> : null}
            {show("lunch") || show("courier") ? <Carried scene={job!} /> : null}
            {/* the small secretary at the director's desk holds the job itself (D-97) */}
            {mini && !room && detailed && job && ["coffee", "tea", "water", "print", "meeting"].includes(job) ? <Carried scene={job} /> : null}
            {/* the thing carried out stays where it was taken: the big face keeps the cup the small
                secretary brings it (SecretaryDesk), the room keeps what went out of the frame */}
            {detailed && finish && CARRY_OUT.has(finish) ? (
              <g style={{ animation: `${mini ? "smc-handed" : "smc-left-behind"} ${FINISH_MS}ms linear both` }}>
                <Carried scene={finish} />
              </g>
            ) : null}
          </g>
          </Blend>
        </g>
        </Blend>
      </g>
      </Blend>

      {/* rest: the desk in front, the hands on the keys */}
      <Linger show={room && rest} out={FADE_OUT}>
        {room && rest ? (
          <>
            <RoomFront act={act} asleep={asleep} still={reading} />
            <TypingHands asleep={asleep} act={act} still={reading} />
          </>
        ) : null}
      </Linger>
      {asleep && detailed ? <Zzz /> : null}

      {/* the pourer rides outside the body's sway: the pour needs a steady hand */}
      <Linger show={inRoom("tea")} out={SMC_OUT} origin="100% 100%">
        {inRoom("tea") ? <Pourer kind="teapot" /> : null}
      </Linger>
      <Linger show={inRoom("water")} out={SMC_OUT} origin="100% 100%">
        {inRoom("water") ? <Pourer kind="carafe" /> : null}
      </Linger>

      {/* doctor and taxi: the call goes out of the microphone, its subject over the head */}
      {show("doctor") || show("taxi") || show("security") ? (
        <>
          <g fill="none" stroke={job === "security" ? "var(--danger)" : "var(--ok)"} strokeWidth="1.3" strokeLinecap="round">
            {["M15 51 Q12 54 15 57", "M11 49 Q6.5 54 11 59"].map((d, i) => (
              <path key={d} d={d} style={{ transformBox: "fill-box", transformOrigin: "100% 50%", animation: `smc-ring 1.1s ease-out ${i * 0.28}s infinite`, opacity: 0 }} />
            ))}
          </g>
          <Bubble tone={job === "taxi" ? "var(--gold)" : "var(--danger)"} motion={job === "security" ? "smc-shake 0.3s ease-in-out infinite" : "none"}>
            <Glyph scene={job!} />
          </Bubble>
        </>
      ) : null}

      {/* walking jobs: speed lines behind, dust from the steps */}
      {show("come") || show("lunch") || show("courier") || danger ? <Dust /> : null}

      {/* asked: the request over the head, as a picture, «+N» for the ones behind it */}
      {/* (the director's desk shows the picture on its monitor instead) */}
      <Linger show={asked && detailed && !mini} origin="30% 100%">
        {asked && detailed && !mini ? (
          <Bubble tone={ringTone} motion={bubbleMotion} queue={queue}>
            <Glyph scene={scene ?? "other"} />
          </Bubble>
        ) : null}
      </Linger>

      {/* accept: «есть!» — a tick pops by the headset */}
      {act === "accept" && detailed ? (
        <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "smc-accept-tick 0.9s ease-out both", opacity: 0 }}>
          <circle cx="2" cy="18" r="5" fill="var(--ok)" />
          <path d="M-0.4 18.2 l1.8 1.8 L5 16.2" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ) : null}

      {/* done: a tick over the head, and two sparks */}
      {done && detailed ? (
        <Delayed ms={finish && CARRY_OUT.has(finish) ? 1850 : 300}>
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "smc-pop 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) both" }}>
            <circle cx="54" cy="6" r="7" fill="var(--ok)" />
            <path d="M50.6 6.2 l2.4 2.4 L57.6 3.6" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <path d="M8 10 l1.2 2.8 l2.8 1.2 l-2.8 1.2 l-1.2 2.8 l-1.2 -2.8 l-2.8 -1.2 l2.8 -1.2 Z" fill="var(--gold)" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-spark 3.8s infinite", opacity: 0 }} />
          <path d="M60 22 l1 2.2 l2.2 1 l-2.2 1 l-1 2.2 l-1 -2.2 l-2.2 -1 l2.2 -1 Z" fill="var(--gold)" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-spark 3.8s 1.9s infinite", opacity: 0 }} />
        </Delayed>
      ) : null}
      {cheer && detailed ? <Confetti /> : null}
      {act === "thanks" && detailed ? <Hearts /> : null}
    </svg>
  );
}

/** Shown after a delay, by CSS alone: the tick waits until the cup has left the frame. */
function Delayed({ ms, children }: { ms: number; children: ReactNode }) {
  return <g style={{ animation: `smc-fade-in 0.01s linear ${ms}ms both` }}>{children}</g>;
}

function Mouth({ talking, asked, alarm, glad, job, rest, yawn }: { talking: boolean; asked: boolean; alarm: boolean; glad: boolean; job: DeskScene | null; rest: boolean; yawn: boolean }) {
  if (talking) {
    return <ellipse cx="32" cy="45" rx="3.8" ry="2.8" fill="var(--bg)" style={{ transformOrigin: "32px 45px", animation: "mascot-mouth 0.9s ease-in-out infinite" }} />;
  }
  // an alarm is a round mouth of fright, not a smile
  if (asked && alarm) return <ellipse cx="32" cy="46.4" rx="2.6" ry="3.2" fill="var(--bg)" />;
  // an eager open smile — «да-да, слушаю»
  if (asked) return <path d="M27.6 43.6 Q32 44.6 36.4 43.6 Q35.6 49 32 49 Q28.4 49 27.6 43.6 Z" fill="var(--bg)" />;
  if (glad) return <path d="M26 43 Q32 48.6 38 43" fill="none" stroke="var(--bg)" strokeWidth="2.2" strokeLinecap="round" />;
  // the stretch comes with a yawn
  if (yawn) return <ellipse cx="32" cy="45.8" rx="2.8" ry="3.4" fill="var(--bg)" style={{ transformOrigin: "32px 45px", animation: "smc-yawn-mouth 2.4s ease-in-out both" }} />;
  // the finger is across the lips — they show on either side of it; walking is a set mouth; any
  // other job is a small smile
  if (job === "dnd") return <path d="M28.4 45.2 H36.4" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />;
  if (job === "come" || job === "lunch" || job === "courier") return <path d="M29 45 H35" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />;
  if (job) return <path d="M27.5 43.8 Q32 47.2 36.5 43.8" fill="none" stroke="var(--bg)" strokeWidth="2" strokeLinecap="round" />;
  if (rest) return <path d="M28.6 43.2 Q32 45.4 35.4 43.2" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />;
  return null;
}

function Dust() {
  return (
    <g stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round">
      {[22, 30, 38].map((y, i) => (
        <path key={y} d={`M62 ${y} h6`} style={{ animation: `smc-speed 0.56s ease-out ${i * 0.12}s infinite`, opacity: 0 }} />
      ))}
      <g fill="var(--text-muted)" stroke="none">
        {[
          { x: 50, y: 59, d: 0 },
          { x: 56, y: 60, d: 0.28 },
        ].map((puff) => (
          <circle key={puff.x} cx={puff.x} cy={puff.y} r="1.8" style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `mascot-act-dust 0.56s ease-out ${puff.d}s infinite`, opacity: 0 }} />
        ))}
      </g>
    </g>
  );
}

/** Dozing at the desk: two small «z» drift up off the head. */
function Zzz() {
  return (
    <g fontSize="6.4" fontWeight="800" fill="var(--text-muted)">
      <text x="46" y="10" style={{ animation: "mascot-zzz 3.4s ease-out infinite", opacity: 0 }}>
        z
      </text>
      <text x="51" y="4" fontSize="5" style={{ animation: "mascot-zzz 3.4s ease-out 1.7s infinite", opacity: 0 }}>
        z
      </text>
    </g>
  );
}
