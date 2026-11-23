import { ACT_OUT, FADE_OUT, Linger, SHRINK_OUT } from "@/components/brand/Linger";
import { SeasonWear } from "@/components/brand/MascotSeason";
import {
  BoardActBehind,
  BoardActFront,
  BRINGS_CARD,
  CallCard,
  ErrorActBehind,
  ErrorActFront,
  handFill,
  Stack,
  WorkActBehind,
  WorkActFront,
  WorkActUnder,
} from "@/components/brand/MascotWork";
import type { MascotState } from "@/components/brand/Mascot";
import { COLOR, PROP_DELAY, PROP_IN, TONE, type MascotPose } from "@/lib/mascot/pose";
import type { MascotSeason } from "@/lib/mascot/season";

/*
 * The props of a state around the assistant's face (components/brand/Mascot.tsx), in paint order:
 * what is drawn behind the whole face, what grows out from behind the body, and what sits on the
 * body in front of it. The face draws them in that order around its own body.
 */

/** checking: the rows of the clipboard, top to bottom — one tick lands in each in turn. */
const CHECK_ROWS = [41, 48.5, 56];
/**
 * checking: the clipboard stands a little off the body, clear of the right eye looking down its rows:
 * dark on dark, the eye and the board ran together at the small size of an open card. The cards the
 * board acts lay on it move with it (ON_BOARD in MascotWork.tsx).
 */
const CLIPBOARD_AT = "translate(2.5 0)";

/**
 * announcing: where the megaphone sits — at the mouth, pointing up and out. Low and only a little up:
 * tipped higher, its bell covered the lower half of the right eye.
 */
export const MEGAPHONE_AT = "translate(39.5 47.5) rotate(-12)";

/**
 * scheduling: one page of the tear-off calendar under its header — a month in cells, today
 * ringed. The torn sheet is the same page drawn again on top of it.
 */
function CalendarPage() {
  return (
    <g>
      <path d="M-18 -0.5 H2 V11 A3 3 0 0 1 -1 14 H-15 A3 3 0 0 1 -18 11 Z" fill="var(--surface)" stroke={TONE.calendar} strokeWidth="1.4" strokeLinejoin="round" />
      <g fill="var(--text-muted)" opacity="0.55">
        {[0, 1, 2, 3].flatMap((col) =>
          [0, 1].map((row) => <rect key={`${col}-${row}`} x={-15.5 + col * 4.6} y={2.6 + row * 5} width="2.8" height="2.8" rx="0.6" />),
        )}
      </g>
      <circle
        cx="-9.5"
        cy="9"
        r="2.9"
        fill="none"
        stroke="var(--warn)"
        strokeWidth="1.3"
        style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-today 1.5s ease-in-out infinite" }}
      />
    </g>
  );
}

/**
 * alert: where the light hangs — clear of the crown on the right and of the hat's pompom (D-149).
 * At avatar size it grows and comes closer, the way the eyes grow there: at 3.6 it is two pixels.
 */
const BEACON = { x: 53, y: 3, r: 3.6 };
const BEACON_SMALL = { x: 51, y: 6, r: 5.6 };

/**
 * alert: a small amber light over the head, like the light of a phone with something unread —
 * «вас кое-что ждёт», with no feeling on the face (D-70, D-149). It breathes twice a cycle and lets
 * a thin ring go with each breath; the second ring goes as the eyes go up to it. At avatar size only
 * the light itself is drawn.
 */
export function Beacon({ detailed }: { detailed: boolean }) {
  const { x, y, r } = detailed ? BEACON : BEACON_SMALL;
  const origin = `${x}px ${y}px`;
  const breath = "2.3s ease-in-out 0.55s infinite";
  const hi = r / BEACON.r;
  return (
    <g data-prop="beacon" style={{ transformOrigin: origin, animation: "mascot-beacon-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both" }}>
      <g style={{ animation: detailed ? "mascot-beacon-float 4.6s ease-in-out infinite" : "none" }}>
        {/* a thin pale ring, not a faint disc: amber at low opacity on the dark board turns brown */}
        {detailed ? (
          <circle
            cx={x}
            cy={y}
            r={r}
            fill="none"
            stroke="color-mix(in srgb, var(--warn) 45%, #ffffff)"
            strokeWidth="1.3"
            // a hairline however far the ring has grown — scaled with it, it went thick and muddy
            vectorEffect="non-scaling-stroke"
            style={{ transformOrigin: origin, animation: "mascot-beacon-ping 2.3s cubic-bezier(0.2, 0, 0.3, 1) 0.55s infinite", opacity: 0 }}
          />
        ) : null}
        <circle cx={x} cy={y} r={r} fill="var(--warn)" style={{ transformOrigin: origin, animation: detailed ? `mascot-beacon-glow ${breath}` : "none" }} />
        <ellipse cx={x - 1.1 * hi} cy={y - 1.3 * hi} rx={1.3 * hi} ry={0.9 * hi} fill="#ffffff" opacity="0.5" />
      </g>
    </g>
  );
}

/** nervous / panicking: the pale blue of sweat — decor, not a status colour; it reads on teal, amber and red alike. */
const SWEAT = "#C4E6FF";

/** A drop of sweat on the skin, its tip at (x, y): swells out, runs down the temple, gone. */
function SweatDrop({ x, y, timing }: { x: number; y: number; timing: string }) {
  return (
    <g style={{ transformOrigin: `${x}px ${y + 5}px`, animation: `mascot-sweat ${timing}` }}>
      <path d={`M${x} ${y} C${x + 3.6} ${y + 4.6} ${x + 3.8} ${y + 9} ${x} ${y + 9} C${x - 3.8} ${y + 9} ${x - 3.6} ${y + 4.6} ${x} ${y} Z`} fill={SWEAT} />
      <ellipse cx={x - 1.2} cy={y + 6.2} rx="0.9" ry="1.3" fill="#ffffff" opacity="0.7" />
    </g>
  );
}

type Props = { state: MascotState; pose: MascotPose; side: string | undefined };

/**
 * Behind the whole face, in front of its ground shadow: the dust of a kick, the bubbles of
 * «Сообщения», the shout's arcs, the waves into the ear, the dots of a thought, the note tucked away,
 * the bars turning into lines, the cards being sorted, the rings of an offer, the z-s of sleep, the
 * store being read, the sparks, the card wound up for a throw, and what an act puts under the face.
 */
export function PropsBehind({ state, pose, side }: Props) {
  const { acting, asleep, detailed, flip, reading } = pose;
  return (
    <>
      {/* kick: the sleeper runs in the dream, and the dust flies from under it */}
      {acting === "kick" ? (
        <g fill="var(--text-muted)">
          {[
            { x: 14, y: 59, d: 0 },
            { x: 50, y: 59, d: 0.22 },
            { x: 20, y: 61, d: 0.44 },
          ].map((puff) => (
            <circle
              key={puff.x}
              cx={puff.x}
              cy={puff.y}
              r="2.2"
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `mascot-act-dust 0.7s ease-out ${puff.d}s both`, opacity: 0 }}
            />
          ))}
        </g>
      ) : null}

      {/* chatting: somebody's bubble comes in on the left with the typing dots, then the answer
          goes out on the right — a conversation, told in two bubbles */}
      <Linger show={state === "chatting" && detailed} out={SHRINK_OUT}>
        {state === "chatting" && detailed ? (
          <>
            <g style={{ transformBox: "fill-box", transformOrigin: "90% 100%", animation: `mascot-bubble-left 3.2s ease-in-out ${PROP_DELAY} infinite`, opacity: 0 }}>
              <path
                d="M-8.5 -6 H0.5 A7.5 7.5 0 0 1 3.07 8.55 L6.5 13.5 L-0.5 9 H-8.5 A7.5 7.5 0 0 1 -8.5 -6 Z"
                fill="var(--surface)"
                stroke={TONE.messages}
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              {[0, 1, 2].map((dot) => (
                <circle
                  key={dot}
                  cx={-9 + dot * 5}
                  cy="1.5"
                  r="1.7"
                  fill={TONE.messages}
                  style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: `mascot-typing 0.9s ease-in-out ${(dot * 0.15).toFixed(2)}s infinite` }}
                />
              ))}
            </g>
            <g style={{ transformBox: "fill-box", transformOrigin: "0% 100%", animation: `mascot-bubble-right 3.2s ease-in-out ${PROP_DELAY} infinite`, opacity: 0 }}>
              <path
                d="M53.5 -10 H62.5 A7.5 7.5 0 0 1 62.5 5 H55 L48.5 9.5 L49.75 4 A7.5 7.5 0 0 1 53.5 -10 Z"
                fill="color-mix(in srgb, var(--accent) 22%, var(--surface))"
                stroke="var(--accent)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              {[0, 1].map((line) => (
                <path
                  key={line}
                  d={line === 0 ? "M52 -4.6 h12.5" : "M52 -0.6 h8"}
                  stroke="var(--accent)"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: `mascot-reply-line 3.2s ease-out ${(0.15 + line * 0.18).toFixed(2)}s infinite` }}
                />
              ))}
            </g>
          </>
        ) : null}
      </Linger>

      {/* announcing: the words leave the bell of the megaphone in arcs, on the shout */}
      <Linger show={state === "announcing" && detailed} out={SHRINK_OUT} origin="0% 50%">
        {state === "announcing" && detailed ? (
          <g transform={MEGAPHONE_AT} fill="none" stroke={TONE.ether} strokeWidth="1.7" strokeLinecap="round">
            {[0, 1, 2].map((wave) => {
              const h = 6 + wave * 2.6;
              return (
                <path
                  key={wave}
                  d={`M${20.5 + wave * 4.4} ${-h} a${h + 1} ${h + 1} 0 0 1 0 ${2 * h}`}
                  style={{
                    transformBox: "fill-box",
                    transformOrigin: "0% 50%",
                    animation: `mascot-shout-wave 1.4s ease-out ${(0.46 + wave * 0.14).toFixed(2)}s infinite`,
                    opacity: 0,
                  }}
                />
              );
            })}
          </g>
        ) : null}
      </Linger>

      {/* listening: sound waves come in from the right and land on the ear; tuned — the gold of
          Эфир, the word to everyone, coming in at an even pace (D-110) */}
      <Linger show={state === "listening" || state === "tuned"} out={SHRINK_OUT} origin="0% 50%">
        {state === "listening" || state === "tuned" ? (
          <g fill="none" stroke={state === "tuned" ? TONE.ether : COLOR.listening} strokeWidth="1.7" strokeLinecap="round">
            {[0, 1, 2].map((wave) => (
              <path
                key={wave}
                d={`M${66 + wave * 5} ${17 - wave * 2.5} a${8 + wave * 4} ${8 + wave * 4} 0 0 1 0 ${16 + wave * 5}`}
                style={{
                  transformOrigin: "62px 25px",
                  // an even pace: a duration that followed the voice restarted the waves
                  // mid-flight twenty times a second — they jittered instead of travelling (D-126)
                  animation: `mascot-wave-in ${state === "tuned" ? "1.6s" : "1.3s"} ease-out ${wave * 0.28}s infinite`,
                  opacity: 0,
                }}
              />
            ))}
          </g>
        ) : null}
      </Linger>

      {/* thinking: three dots come and go above the head, like a message being typed */}
      <Linger show={state === "thinking"} out={SHRINK_OUT} origin="0% 100%">
        {state === "thinking" ? (
          <g fill={COLOR.thinking}>
            {[0, 1, 2].map((dot) => (
              <circle
                key={dot}
                cx={44 + dot * 6}
                cy={8 - dot * 2}
                r={2 + dot * 0.4}
                style={{
                  transformOrigin: `${44 + dot * 6}px ${8 - dot * 2}px`,
                  animation: `mascot-dot 2.6s ${dot * 0.22}s infinite`,
                  opacity: 0,
                }}
              />
            ))}
          </g>
        ) : null}
      </Linger>

      {/* saving: a note sinks into the head and is gone — tucked away safely */}
      <Linger show={state === "saving"} out={FADE_OUT}>
        {state === "saving" ? (
          <g style={{ transformOrigin: "32px -2px", animation: "mascot-tuck-note 1.4s ease-in-out infinite", opacity: 0 }}>
            <rect x="24" y="-9" width="16" height="12" rx="2.5" fill="var(--surface)" stroke={COLOR.saving} strokeWidth="1.5" />
            <path d="M27 -4.5h10M27 -1.5h6" stroke={COLOR.saving} strokeWidth="1.3" strokeLinecap="round" />
          </g>
        ) : null}
      </Linger>

      {/* transcribing: bars of sound turn, one after another, into lines of text */}
      <Linger show={state === "transcribing"} out={SHRINK_OUT} origin="50% 50%">
        {state === "transcribing" ? (
          <g fill={COLOR.transcribing}>
            {/* the voice: four bars that breathe, then go quiet */}
            {[0, 1, 2, 3].map((bar) => (
              <rect
                key={`bar-${bar}`}
                x={-9 + bar * 4}
                y={22 - [4, 7, 5, 3][bar]!}
                width="2.2"
                height={[8, 14, 10, 6][bar]}
                rx="1.1"
                style={{
                  transformOrigin: `${-8 + bar * 4}px 22px`,
                  animation: `mascot-bar-fade 2.4s ease-in-out ${bar * 0.12}s infinite`,
                }}
              />
            ))}
            {/* the words: three lines type in on the right, one under another */}
            {[0, 1, 2].map((line) => (
              <rect
                key={`line-${line}`}
                x="65"
                y={15 + line * 5.5}
                width={[13, 9, 11][line]}
                height="2.4"
                rx="1.2"
                style={{
                  transformOrigin: "65px 16px",
                  animation: `mascot-line-type 2.4s ease-out ${0.7 + line * 0.3}s infinite`,
                  opacity: 0,
                }}
              />
            ))}
          </g>
        ) : null}
      </Linger>

      {/* parsing: cards appear over the head one by one and slide into a stack on the right */}
      <Linger show={state === "parsing"} out={SHRINK_OUT}>
        {state === "parsing" ? (
          <g>
            {[0, 1, 2].map((card) => (
              <g
                key={card}
                style={{
                  transformOrigin: `${20 + card * 14}px -4px`,
                  animation: `mascot-sort-card 2.4s ease-in-out ${card * 0.3}s infinite`,
                  opacity: 0,
                }}
              >
                <rect x={12 + card * 14} y="-9" width="13" height="10" rx="2.5" fill="var(--surface)" stroke={COLOR.parsing} strokeWidth="1.4" />
                <path d={`M${15 + card * 14} -5h7M${15 + card * 14} -2h4`} stroke={COLOR.parsing} strokeWidth="1.1" strokeLinecap="round" />
              </g>
            ))}
          </g>
        ) : null}
      </Linger>

      {/* offering: the parsed cards wait in hand — a ring ripples out of the blob and the
          stack lifts every time it pops back, so the face itself says «tap me» */}
      <Linger show={state === "offering"} out={FADE_OUT}>
        {state === "offering" ? (
          <>
            <g fill="none" stroke={COLOR.offering} strokeWidth="1.6">
              {[0, 1].map((ring) => (
                <circle
                  key={ring}
                  cx="32"
                  cy="32"
                  r="27"
                  style={{ transformOrigin: "32px 32px", animation: `mascot-tap-ring 1.6s ease-out ${(0.3 + ring * 0.8).toFixed(2)}s infinite`, opacity: 0 }}
                />
              ))}
            </g>
            {detailed ? (
              <g style={{ transformOrigin: "32px -3px", animation: "mascot-offer-card 1.6s cubic-bezier(0.4, 0, 0.2, 1) infinite" }}>
                <rect x="20" y="-11" width="15" height="11" rx="2.5" fill="var(--surface)" stroke={COLOR.offering} strokeWidth="1.4" opacity="0.7" transform="rotate(-6 27.5 -5.5)" />
                <rect x="25" y="-9" width="15" height="11" rx="2.5" fill="var(--surface)" stroke={COLOR.offering} strokeWidth="1.4" />
                <path d="M28 -5h9M28 -1.5h5" stroke={COLOR.offering} strokeWidth="1.1" strokeLinecap="round" />
              </g>
            ) : null}
          </>
        ) : null}
      </Linger>

      {/* sleeping: two small z-s drift up from the head, one after the other */}
      <Linger show={asleep} out={FADE_OUT}>
        {asleep ? (
          <g fill="var(--text-muted)" fontFamily="var(--font-display), system-ui, sans-serif" fontWeight="700">
            <text x="50" y="12" fontSize="8" style={{ transformOrigin: "52px 12px", animation: "mascot-zzz 3.5s ease-out infinite", opacity: 0 }}>
              z
            </text>
            <text x="56" y="4" fontSize="6" style={{ transformOrigin: "58px 4px", animation: "mascot-zzz 3.5s ease-out 1.75s infinite", opacity: 0 }}>
              z
            </text>
          </g>
        ) : null}
      </Linger>

      {/* processing: the store the assistant plugs into, and the data crossing into the head */}
      {reading ? (
        <>
          <g style={{ transformOrigin: "-5px 17px", animation: "mascot-store 1.9s both", opacity: 0 }}>
            <path d="M-12 13 V21 A7 2.6 0 0 0 2 21 V13 Z" fill="var(--surface)" stroke={COLOR.processing} strokeWidth="1.4" />
            <ellipse cx="-5" cy="13" rx="7" ry="2.6" fill="var(--surface)" stroke={COLOR.processing} strokeWidth="1.4" />
            <path d="M-12 17.4 A7 2.6 0 0 0 2 17.4" fill="none" stroke={COLOR.processing} strokeWidth="1.1" opacity="0.65" />
          </g>
          {[0, 1, 2].map((bit) => (
            <circle
              key={bit}
              cx="1"
              cy="17"
              r="1.6"
              fill={COLOR.processing}
              style={{ transformOrigin: "1px 17px", animation: `mascot-data-bit 0.3s ${(0.06 + bit * 0.1).toFixed(2)}s 2 forwards`, opacity: 0 }}
            />
          ))}
        </>
      ) : null}

      {/* happy: two sparks pop beside the blob in turn */}
      <Linger show={state === "happy"} out={SHRINK_OUT} origin="50% 50%">
        {state === "happy" ? (
          <g fill={COLOR.happy}>
            {/* clear of the body: drawn behind it, a spark half inside it read as a pointed ear */}
            <path
              d="M1 10 L2.6 14.4 L7 16 L2.6 17.6 L1 22 L-0.6 17.6 L-5 16 L-0.6 14.4 Z"
              style={{ transformOrigin: "1px 16px", animation: "mascot-spark 3.8s infinite", opacity: 0 }}
            />
            <path
              d="M56 6 L57.2 9.2 L60.4 10.4 L57.2 11.6 L56 14.8 L54.8 11.6 L51.6 10.4 L54.8 9.2 Z"
              style={{ transformOrigin: "56px 10.4px", animation: "mascot-spark 3.8s 1.9s infinite", opacity: 0 }}
            />
          </g>
        ) : null}
      </Linger>

      {/* the wind-up of a throw: the card in the hand behind the head, only its top over the crown
          — `sending`, and the employee's «Сдал» (under the body, so the head hides the rest) */}
      {state === "sending" && detailed ? (
        <g style={{ transformOrigin: "42px 12px", animation: "mascot-throw-card-back 1.2s linear infinite", opacity: 0 }}>
          <rect x="34" y="5" width="17" height="12" rx="3" fill="var(--surface)" stroke={COLOR.sending} strokeWidth="1.5" />
          <path d="M37.5 9.5h10M37.5 13h6" stroke={COLOR.sending} strokeWidth="1.2" strokeLinecap="round" />
          <ellipse cx="36" cy="5.6" rx="3" ry="2.6" fill={handFill(COLOR.sending)} />
        </g>
      ) : null}
      <Linger show={acting !== null} out={ACT_OUT}>
        {acting ? (
          <g transform={side}>
            <WorkActUnder act={acting} body={COLOR[state]} flip={flip} />
          </g>
        ) : null}
      </Linger>
    </>
  );
}

/**
 * Behind the body, riding it: the new order over the head, the calendar over the shoulder, and the
 * hands of an act that come out from behind the body — drawn before it, so it covers their roots.
 */
export function PropsBehindBody({ state, pose, side }: Props) {
  const { acting, detailed, flip, hands } = pose;
  return (
    <>
      {/* calling: the new order over the head — a card with a «!» badge (D-110), the bare «!»
          at avatar size. It rides the body, so it goes up with every hop instead of hanging
          where the head was; it pops in time with them. A card flying in brings it itself. */}
      <Linger show={state === "calling" && !(acting && BRINGS_CARD.has(acting))}>
        {state === "calling" && !(acting && BRINGS_CARD.has(acting)) ? <CallCard color={COLOR.calling} detailed={detailed} /> : null}
      </Linger>
      {/* scheduling: a tear-off calendar held up over the left shoulder by the left hand —
          the arm comes out behind the body, so the calendar leans with it; the top page
          lifts, turns and falls away, the next day is already under it, and today's cell
          keeps pulsing */}
      <Linger show={state === "scheduling" && detailed} origin="100% 100%">
        {state === "scheduling" && detailed ? (
          <g style={{ transformOrigin: "12px 30px", animation: PROP_IN }}>
            <CalendarPage />
            <g style={{ transformBox: "fill-box", transformOrigin: "50% 0%", animation: "mascot-page-flip 3s ease-in infinite" }}>
              <CalendarPage />
            </g>
            {/* the header and its rings stay put: only the page under them turns */}
            <path d="M-18 -3 V-3.5 A3 3 0 0 1 -15 -6.5 H-1 A3 3 0 0 1 2 -3.5 V-0.5 H-18 Z" fill={TONE.calendar} />
            <g fill="var(--text-muted)">
              <rect x="-13.5" y="-9" width="1.8" height="4.6" rx="0.9" />
              <rect x="-4.3" y="-9" width="1.8" height="4.6" rx="0.9" />
            </g>
            {/* the arm under it, bent at the elbow — out of the side, down a little and up to the
                lower edge, the way a thing is held up to be seen — and the hand on that edge */}
            <path d="M12 31.5 C4 35 -1.6 36.4 -3.6 31.4 C-4.8 27.6 -5.6 22.4 -5.9 17.6" fill="none" stroke={COLOR[state]} strokeWidth="5.4" strokeLinecap="round" />
            <ellipse cx="-6.2" cy="15.4" rx="4.2" ry="3.2" transform="rotate(-24 -6.2 15.4)" fill={COLOR[state]} />
          </g>
        ) : null}
      </Linger>
      {/* wave: a small hand comes out from behind the body and waves — drawn first, so
          the body covers its root and it reads as growing out of it. The right hand may hold
          the employee's stack or a job (the clipboard, the megaphone): then the left one waves */}
      {/* the hands of an act cut short draw back into the body (ACT_OUT) */}
      <Linger show={acting !== null} out={ACT_OUT}>
      {acting === "wave" ? (
        <g transform={side}>
          <g style={{ transformOrigin: "53px 30px", animation: "mascot-act-hand 1.8s ease-in-out both" }}>
            {/* an arm raised out of the side, a mitten with its thumb out at the end of it */}
            <path d="M50 32 Q60 27 64 14" fill="none" stroke={COLOR[state]} strokeWidth="5.4" strokeLinecap="round" />
            {/* the hand overshoots every swing and catches up: follow-through at the wrist */}
            <g style={{ transformOrigin: "64px 14px", animation: "mascot-act-wrist 1.8s ease-in-out both" }}>
              <ellipse cx="65" cy="9.5" rx="4.8" ry="5.8" transform="rotate(18 65 9.5)" fill={COLOR[state]} />
              <ellipse cx="60.4" cy="12" rx="1.9" ry="2.9" transform="rotate(-38 60.4 12)" fill={COLOR[state]} />
              <ellipse cx="64" cy="7.4" rx="2" ry="1.2" transform="rotate(18 64 7.4)" fill="#ffffff" opacity="0.2" />
            </g>
          </g>
        </g>
      ) : null}
      {/* the hands of the work, behind the body the same way: a hand up, palms out, a thumb, the watch (D-110) */}
      {acting ? (
        <g transform={side}>
          <WorkActBehind act={acting} body={COLOR[state]} flip={flip} only={hands.only} />
          <BoardActBehind act={acting} body={COLOR[state]} />
          <ErrorActBehind act={acting} body={COLOR[state]} />
        </g>
      ) : null}
      </Linger>
    </>
  );
}

/**
 * On the body, in front of it: sweat, the ear, the holiday wear, the blush, the clipboard, the
 * megaphone, the cup, the employee's stack of orders and what an act puts in front of the body.
 */
export function PropsOnBody({
  state,
  pose,
  side,
  carry,
  season,
  blushMs,
}: Props & { carry: { count: number; hot?: boolean } | null; season: MascotSeason | null; blushMs: number }) {
  const { acting, actBlush, anxious, cheeks, detailed, flip, hands, holding, mittenOff, onBoard, penDown, wear } = pose;
  return (
    <>
      {/* nervous and panicking: a drop of sweat runs down the temple at different tempos. On the
          skin, in front of the head and riding it: drawn behind the body, only its outlined tip
          stuck out past the edge and read as a small ear */}
      <Linger show={anxious} out={FADE_OUT}>
        {anxious ? (
          <g>
            <SweatDrop x={51} y={12} timing={`${state === "panicking" ? "1.92s" : "5.4s"} ease-out infinite`} />
            {state === "panicking" ? <SweatDrop x={13} y={19} timing="1.92s ease-out 0.18s infinite" /> : null}
          </g>
        ) : null}
      </Linger>

      {/* listening: the ear pricks up on the right and twitches now and then; tuned — the
          same ear, turned to the word to everyone (D-110) */}
      <Linger show={state === "listening" || state === "tuned"} origin="0% 80%">
        {state === "listening" || state === "tuned" ? (
          <g style={{ transformOrigin: "53px 26px", animation: "mascot-ear-up 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.2s both" }}>
            <g style={{ transformOrigin: "53px 26px", animation: "mascot-ear-twitch 3.2s ease-in-out 1s infinite" }}>
              {/* a proper ear: a rounded lobe standing out of the head, with a darker hollow */}
              <path d="M52 16 C58 8 69 12 68 22 C67.5 29 61 33 55 31 C53 30 51.5 28 52 26 Z" fill={COLOR.listening} />
              <path d="M56 19 C60 15.5 65.5 18.5 64.5 24 C64 27.5 60 29.5 57.5 27.5 C56 26.5 55.5 24.5 56.5 23 Z" fill="var(--bg)" opacity="0.26" />
            </g>
          </g>
        ) : null}
      </Linger>

      {/* a holiday on the crown, riding the body (D-119) */}
      <Linger show={wear} out={FADE_OUT}>
        {wear && season ? (
          // put back on with a small spring after it stepped aside, instead of blinking in
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-wear-in 0.4s cubic-bezier(0.34, 1.5, 0.64, 1) both" }}>
            <SeasonWear season={season} />
          </g>
        ) : null}
      </Linger>

      {/* happy, celebrating and serving: a soft blush under the eyes */}
      {cheeks ? (
        <g fill="#ffffff" opacity="0.22" style={{ animation: "mascot-blush 3.8s infinite" }}>
          <ellipse cx="17" cy="40" rx="4" ry="2" />
          <ellipse cx="47" cy="40" rx="4" ry="2" />
        </g>
      ) : null}
      {/* an act that warms the cheeks does it for its own length and lets them cool */}
      {actBlush ? (
        <g fill="#ffffff" style={{ animation: `mascot-act-blush ${blushMs}ms ease-in-out both`, opacity: 0 }}>
          <ellipse cx="17" cy="40" rx="4" ry="2" />
          <ellipse cx="47" cy="40" rx="4" ry="2" />
        </g>
      ) : null}

      {/* checking: the clipboard of «Задачи», held in front of the body; a tick lands in
          each row in turn, the way a list is gone through */}
      <Linger show={state === "checking" && detailed} origin="30% 100%">
        {state === "checking" && detailed ? (
          <g style={{ transformBox: "fill-box", transformOrigin: "30% 100%", animation: PROP_IN }}>
            <g transform={CLIPBOARD_AT}>
            <rect x="48" y="32.5" width="24" height="30" rx="3.5" fill="var(--surface)" stroke={TONE.tasks} strokeWidth="1.5" />
            <rect x="54" y="29.9" width="12" height="5.2" rx="2" fill={TONE.tasks} />
            {CHECK_ROWS.map((y, row) => (
              <g key={y}>
                <rect x="51.5" y={y - 3} width="6" height="6" rx="1.4" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" />
                <path d={`M61 ${y} h${row === 1 ? 6.5 : 8}`} stroke="var(--text-muted)" strokeWidth="1.6" strokeLinecap="round" />
                <path
                  d={`M52.6 ${y - 0.1} l1.9 1.9 l3.6 -3.8`}
                  fill="none"
                  stroke="var(--ok)"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ transformBox: "fill-box", transformOrigin: "35% 70%", animation: `mascot-tick-${row + 1} 3.6s ease-out infinite`, opacity: 0 }}
                />
              </g>
            ))}
            {/* the thumb over the bottom edge: the board is held, not floating */}
            <ellipse cx="59.5" cy="62.4" rx="3" ry="2.3" fill={COLOR[state]} />
            {/* the other hand ticks the rows off with a pencil, in step with the ticks; an act
                of the board that needs that hand puts the pencil down for its length. It fades
                rather than unmounts, so its stroke keeps step with the ticks when it is back */}
            <g style={{ opacity: penDown ? 0 : 1, transition: "opacity 180ms var(--ease-out)" }}>
              <g style={{ animation: "mascot-check-pen 3.6s ease-in-out infinite" }}>
                <path d="M54.6 41.4 L48 44.6" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
                <path d="M54.6 41.4 L53.2 42.1" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
                <ellipse cx="47.8" cy="45" rx="2.8" ry="2.4" fill={handFill(COLOR[state])} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
              </g>
            </g>
            </g>
          </g>
        ) : null}
      </Linger>

      {/* announcing: the megaphone at the mouth, pointing up and out at the whole company */}
      <Linger show={state === "announcing" && detailed} origin="0% 60%">
        {state === "announcing" && detailed ? (
          <g transform={MEGAPHONE_AT}>
            <g style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: `mascot-prop-in 0.4s cubic-bezier(0.34, 1.4, 0.64, 1) ${PROP_DELAY} both` }}>
              <rect x="-3" y="-2.4" width="4" height="4.8" rx="1.2" fill={`color-mix(in srgb, ${TONE.ether} 70%, var(--bg))`} />
              <path d="M0.5 -3.2 L5 -3.2 L17 -9.6 L17 9.6 L5 3.2 L0.5 3.2 Z" fill={TONE.ether} />
              <path d="M6 3.4 L7.6 8.6" stroke={`color-mix(in srgb, ${TONE.ether} 70%, var(--bg))`} strokeWidth="2.6" strokeLinecap="round" />
              <ellipse cx="17" cy="0" rx="2.3" ry="9.6" fill={`color-mix(in srgb, ${TONE.ether} 62%, var(--bg))`} />
              <path d="M6 -2.6 L15.6 -7.6" stroke="#ffffff" strokeOpacity="0.35" strokeWidth="1.1" strokeLinecap="round" />
              {/* the fist on the grip */}
              <ellipse cx="7.2" cy="7.6" rx="2.6" ry="3.2" transform="rotate(-16 7.2 7.6)" fill={handFill(COLOR[state])} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
            </g>
          </g>
        ) : null}
      </Linger>

      {/* serving: the cup of «Секретарь» on its saucer, carried with care */}
      <Linger show={state === "serving" && detailed}>
        {state === "serving" && detailed ? (
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: `mascot-prop-in 0.5s cubic-bezier(0.34, 1.4, 0.64, 1) ${PROP_DELAY} both` }}>
            <ellipse cx="52.5" cy="59.2" rx="11.5" ry="2.6" fill="var(--surface)" stroke={TONE.secretary} strokeWidth="1.3" />
            <path d="M60.6 48.6 a3.4 3.4 0 0 1 0 6.8" fill="none" stroke={TONE.secretary} strokeWidth="1.8" />
            <path d="M44.4 47 H60.6 V52 A6 6 0 0 1 54.6 58 H50.4 A6 6 0 0 1 44.4 52 Z" fill="var(--surface)" stroke={TONE.secretary} strokeWidth="1.5" strokeLinejoin="round" />
            <ellipse cx="52.5" cy="47.4" rx="7.4" ry="1.5" fill={`color-mix(in srgb, ${TONE.secretary} 55%, var(--bg))`} />
            {/* both hands under the saucer: a cup is carried with care */}
            {/* the left one only steadies it: an act that needs that hand takes it off for its length */}
            <ellipse
              cx="41.6"
              cy="58.8"
              rx="2.8"
              ry="2.2"
              fill={handFill(COLOR[state])}
              style={{ opacity: mittenOff === "left" ? 0 : 1, transition: "opacity 180ms var(--ease-out)" }}
            />
            <ellipse cx="63.4" cy="58.8" rx="2.8" ry="2.2" fill={handFill(COLOR[state])} />
          </g>
        ) : null}
      </Linger>

      {/* the employee's orders in work, a stack of cards in the hands (D-110) */}
      <Linger show={holding} origin="30% 100%">
        {holding ? <Stack count={carry!.count} hot={carry!.hot === true} body={COLOR[state]} shuffle={acting === "shuffle"} /> : null}
      </Linger>
      {/* what the work puts in front of the body for a moment: the medal, the hand at the brow, the ear */}
      <Linger show={acting !== null} out={ACT_OUT}>
        {acting ? (
          <g transform={side}>
            <WorkActFront act={acting} body={COLOR[state]} />
            {/* the director's hands on the card of the board: taken, stamped, flicked, crumpled (tasks/020) */}
            <BoardActFront act={acting} body={COLOR[state]} board={onBoard} flip={flip} only={hands.only} />
            <ErrorActFront act={acting} body={COLOR[state]} />
          </g>
        ) : null}
      </Linger>
    </>
  );
}
