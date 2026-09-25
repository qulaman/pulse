import type { CSSProperties } from "react";

/**
 * The props of the employee's face (D-110): the director's «Капля» hands the task out as a
 * card (`sending`), the employee's catches that card, carries it, throws it back up to the
 * director and gets it back — to redo, or with a medal. Each piece is a fragment of the one
 * mascot SVG (components/brand/Mascot.tsx decides where in the layer stack it goes), drawn in
 * the 64-unit box, animated by transform and opacity only (keyframes in app/globals.css).
 */

/** Where the card over the head sits: the spot of the old «!» of `calling` (D-69). */
export const CARD_AT = { x: 46, y: -5 };

type Badge = "new" | "insist" | "back" | "done" | "ask";

const BADGE_FILL: Record<Badge, string> = {
  new: "var(--warn)",
  insist: "var(--danger)",
  back: "var(--warn)",
  done: "var(--ok)",
  ask: "var(--warn)",
};

/**
 * One task card, centred on 0,0: the lines of its text and a round badge on its corner that
 * says what the card is — «!» new, «!!» insisted, a curl sent back to redo, a tick handed over.
 */
function CardShape({ badge, stroke }: { badge: Badge | null; stroke: string }) {
  return (
    <>
      <rect x="-9" y="-6.5" width="18" height="13" rx="2.8" fill="var(--surface)" stroke={stroke} strokeWidth="1.5" />
      <path d="M-5.6 -1.8 h8.6 M-5.6 1.8 h5.4" stroke="var(--text-muted)" strokeWidth="1.4" strokeLinecap="round" />
      {badge ? (
        <g transform="translate(9 -6.5)">
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: badge === "new" ? "mascot-badge 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite" : "none" }}>
            <circle r="4.6" fill={BADGE_FILL[badge]} stroke="var(--surface)" strokeWidth="0.9" />
            {badge === "new" ? (
              <>
                <path d="M0 -2.6 V0.4" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
                <circle cy="2.2" r="0.95" fill="var(--bg)" />
              </>
            ) : null}
            {badge === "insist" ? (
              <>
                <path d="M-1.3 -2.6 V0.4 M1.3 -2.6 V0.4" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" />
                <circle cx="-1.3" cy="2.2" r="0.85" fill="var(--bg)" />
                <circle cx="1.3" cy="2.2" r="0.85" fill="var(--bg)" />
              </>
            ) : null}
            {badge === "back" ? (
              // a curl that turns back on itself: «ещё раз»
              <>
                <path d="M1.9 -1.5 A2.3 2.3 0 1 0 2.2 1.1" fill="none" stroke="var(--bg)" strokeWidth="1.4" strokeLinecap="round" />
                <path d="M0.2 -2.4 L2.2 -1.6 L1.6 0.4" fill="none" stroke="var(--bg)" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </>
            ) : null}
            {badge === "done" ? (
              <path d="M-2 0.2 l1.4 1.5 l2.8 -3" fill="none" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {badge === "ask" ? (
              // the employee's «Уточнить», on the card it came with
              <text y="0.4" fontSize="6.6" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="var(--bg)" fontFamily="var(--font-display), system-ui, sans-serif">
                ?
              </text>
            ) : null}
          </g>
        </g>
      ) : null}
    </>
  );
}

/** The card over the head, tilted a little, as a hand would hold it up. */
function CardOverHead({ badge, stroke }: { badge: Badge | null; stroke: string }) {
  return (
    <g transform={`translate(${CARD_AT.x} ${CARD_AT.y}) rotate(-6)`}>
      <CardShape badge={badge} stroke={stroke} />
    </g>
  );
}

const CARD_ORIGIN = `${CARD_AT.x}px ${CARD_AT.y}px`;

/**
 * `calling` on the employee's face (D-69 → D-110): the «!» is now the new order itself — a card
 * with a «!» badge, popping over the head with every hop. At avatar size the bare «!» stays.
 */
export function CallCard({ color, detailed }: { color: string; detailed: boolean }) {
  return (
    <g data-prop="call-card" data-still="show" style={{ transformOrigin: "46px 2px", animation: "mascot-call-mark 1.9s cubic-bezier(0.3, 0, 0.2, 1) infinite", opacity: 0 }}>
      {detailed ? (
        <CardOverHead badge="new" stroke={color} />
      ) : (
        <>
          <path d="M46 -9 L46 -1" stroke={color} strokeWidth="4.4" strokeLinecap="round" />
          <circle cx="46" cy="3.4" r="2.2" fill={color} />
        </>
      )}
    </g>
  );
}

/** An envelope centred on 0,0; its flap is its own path, so «Прочитал» can open it. */
function EnvelopeShape({ open = false, dot = true }: { open?: boolean; dot?: boolean }) {
  return (
    <>
      <rect x="-8" y="-5.5" width="16" height="11" rx="1.8" fill="var(--surface)" stroke="var(--warn)" strokeWidth="1.4" />
      <path
        d="M-7.2 -4.9 L0 0.9 L7.2 -4.9"
        fill="none"
        stroke="var(--warn)"
        strokeWidth="1.3"
        strokeLinejoin="round"
        style={open ? { transformBox: "fill-box", transformOrigin: "50% 0%", animation: "mascot-act-flap 1.4s ease-in-out both" } : undefined}
      />
      {dot ? <circle cx="7.6" cy="-5.2" r="2.5" fill="var(--warn)" stroke="var(--surface)" strokeWidth="1" /> : null}
    </>
  );
}

/** Where the unread envelope bobs: up and left of the head, clear of the sweat on the right. */
const LETTER_AT = { x: 5, y: 7 };

/** `nervous` (D-110): the director's word nobody has read yet, by the head — it says why. */
export function Letter() {
  return (
    <g data-prop="letter" transform={`translate(${LETTER_AT.x} ${LETTER_AT.y})`}>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-letter-bob 1.35s ease-in-out infinite" }}>
        <EnvelopeShape />
      </g>
    </g>
  );
}

/**
 * The orders in work, in the face's hands (D-110): up to three cards fanned, the count on a
 * badge from two on, a thumb over the edge. A card due within the hour burns on top.
 */
export function Stack({ count, hot, body, shuffle }: { count: number; hot: boolean; body: string; shuffle: boolean }) {
  const shown = Math.min(count, 3);
  const edge = "var(--accent)";
  return (
    <g data-carry={count} style={{ transformBox: "fill-box", transformOrigin: "30% 100%", animation: "mascot-prop-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) both" }}>
      {shown >= 3 ? (
        <g transform="translate(52.4 51.6) rotate(-11)" opacity="0.85">
          <rect x="-8.5" y="-6" width="17" height="12" rx="2.6" fill="var(--surface)" stroke={edge} strokeWidth="1.3" />
        </g>
      ) : null}
      {shown >= 2 ? (
        <g transform="translate(53.2 50.4) rotate(-4)" opacity="0.92">
          <rect x="-8.5" y="-6" width="17" height="12" rx="2.6" fill="var(--surface)" stroke={edge} strokeWidth="1.3" />
        </g>
      ) : null}
      {/* the top card: the one in work right now; it goes through the pile on «shuffle» */}
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: shuffle ? "mascot-act-shuffle 1.4s ease-in-out both" : "none" }}>
        <g transform="translate(54 49) rotate(5)">
          <rect x="-8.5" y="-6" width="17" height="12" rx="2.6" fill="var(--surface)" stroke={hot ? "var(--danger)" : edge} strokeWidth={hot ? 1.7 : 1.4} />
          <path d="M-5.2 -1.8 h8 M-5.2 1.8 h5" stroke="var(--text-muted)" strokeWidth="1.3" strokeLinecap="round" />
          {hot ? (
            // the clock of a deadline that is upon it
            <g transform="translate(8.4 -6)">
              <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-hot 0.96s ease-in-out infinite" }}>
                <circle r="3.8" fill="var(--danger)" stroke="var(--surface)" strokeWidth="0.9" />
                <path d="M0 -2.1 V0 H1.7" fill="none" stroke="#ffffff" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            </g>
          ) : null}
        </g>
      </g>
      {/* a thumb over the edge: the stack is held, not floating */}
      <ellipse cx="46" cy="51.4" rx="2.3" ry="3.1" transform="rotate(-18 46 51.4)" fill={body} />
      {/* how many: on the lower corner, clear of the eye above and of the clock of a hot card */}
      {count >= 2 ? (
        <g transform="translate(63.2 55.6)">
          <circle r="4.4" fill="var(--surface)" stroke={edge} strokeWidth="1.2" />
          <text y="0.3" fontSize="6.4" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="var(--text)" fontFamily="var(--font-display), system-ui, sans-serif">
            {count > 9 ? "9+" : count}
          </text>
        </g>
      ) : null}
    </g>
  );
}

/**
 * `awaiting` (D-110): everything handed over — the sand runs, the glass turns over, again. It stands
 * on the ground at the right of the face (its foot on the shadow's line), in front of the body.
 */
export function Hourglass() {
  const tone = "var(--accent)";
  return (
    <g transform="translate(4 1.4)">
    <g data-prop="hourglass" style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-prop-in 0.45s cubic-bezier(0.34, 1.4, 0.64, 1) both" }}>
      <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-hourglass 4.2s infinite" }}>
        <path
          d="M48.4 43.4 H57.6 C57.6 47 55.1 48.6 53.9 50.5 C55.1 52.4 57.6 54 57.6 57.6 H48.4 C48.4 54 50.9 52.4 52.1 50.5 C50.9 48.6 48.4 47 48.4 43.4 Z"
          fill="var(--surface)"
          stroke={tone}
          strokeWidth="1.2"
        />
        <path
          d="M49.7 44.6 H56.3 C55.9 46.8 54.4 48 53 49.6 C51.6 48 50.1 46.8 49.7 44.6 Z"
          fill="var(--gold)"
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-sand-top 4.2s linear infinite" }}
        />
        <rect x="52.7" y="49.4" width="0.6" height="7.4" fill="var(--gold)" style={{ animation: "mascot-sand-stream 4.2s linear infinite" }} />
        <path
          d="M49.5 56.9 H56.5 C56.1 54.6 54.6 53.6 53 53.2 C51.4 53.6 49.9 54.6 49.5 56.9 Z"
          fill="var(--gold)"
          style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-sand-bottom 4.2s linear infinite" }}
        />
        <rect x="46.6" y="41.4" width="12.8" height="2.2" rx="1.1" fill={tone} />
        <rect x="46.6" y="57.4" width="12.8" height="2.2" rx="1.1" fill={tone} />
      </g>
    </g>
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* The acts of the work — one-shots over the state (D-110)                     */
/* -------------------------------------------------------------------------- */

/** The acts this file draws; Mascot.tsx owns their timing tables. */
export type WorkAct =
  | "catch"
  | "insist"
  | "nod"
  | "raise"
  | "shrug"
  | "poof"
  | "handover"
  | "medal"
  | "boomerang"
  | "relief"
  | "letter"
  | "read"
  | "listen"
  | "thumb"
  | "watch"
  | "wipe"
  | "shuffle"
  | "coin";

/** The acts that bring the card over the head themselves: `calling`'s own card waits them out. */
export const BRINGS_CARD: ReadonlySet<string> = new Set(["catch", "insist", "boomerang"]);
/** The acts that play the envelope themselves: `nervous`'s own envelope waits them out. */
export const BRINGS_LETTER: ReadonlySet<string> = new Set(["letter", "read"]);

/** A hand drawn in front of the body: the body's colour in shade, so it reads over the body. */
export const handFill = (body: string) => `color-mix(in srgb, ${body} 72%, #000000)`;

/**
 * The face drawn the other way round (x → 64 − x): a gesture of the right hand played by the left
 * one. Set as an SVG attribute on a wrapper, so the CSS motion inside is mirrored with it.
 */
export const MIRROR = "matrix(-1 0 0 1 64 0)";

/**
 * Behind the body (drawn before it, inside the body's motion group — the body covers the root
 * of the arm, so the arm grows out of it, the way the D-82 wave does).
 */
export function WorkActBehind({ act, body, holding = false }: { act: string; body: string; holding?: boolean }) {
  if (act === "raise") {
    // the left hand: the card of a new order waits over the right shoulder
    return (
      <g style={{ transformOrigin: "13px 31px", animation: "mascot-act-arm 1.8s ease-in-out both" }}>
        <path d="M14 31 Q6 22 5 8" fill="none" stroke={body} strokeWidth="5.4" strokeLinecap="round" />
        <ellipse cx="4.6" cy="4" rx="4.6" ry="5.6" transform="rotate(-6 4.6 4)" fill={body} />
        <ellipse cx="8.8" cy="6.6" rx="1.8" ry="2.8" transform="rotate(40 8.8 6.6)" fill={body} />
      </g>
    );
  }
  if (act === "shrug" || act === "poof") {
    // palms up on both sides; on «poof» they come after the card is gone. The right hand keeps
    // the stack if there is one — the shrug lifts it with the shoulders instead
    const timing = act === "poof" ? "1.2s ease-in-out 0.6s both" : "1.8s ease-in-out both";
    return (
      <>
        <g style={{ transformOrigin: "12px 44px", animation: `mascot-act-palm ${timing}` }}>
          <path d="M12 44 Q5 44 2.4 39.6" fill="none" stroke={body} strokeWidth="5" strokeLinecap="round" />
          <ellipse cx="0.8" cy="38" rx="4.8" ry="2.6" transform="rotate(-22 0.8 38)" fill={body} />
        </g>
        {holding ? null : (
          <g style={{ transformOrigin: "52px 44px", animation: `mascot-act-palm ${timing}` }}>
            <path d="M52 44 Q59 44 61.6 39.6" fill="none" stroke={body} strokeWidth="5" strokeLinecap="round" />
            <ellipse cx="63.2" cy="38" rx="4.8" ry="2.6" transform="rotate(22 63.2 38)" fill={body} />
          </g>
        )}
      </>
    );
  }
  if (act === "thumb") {
    // out of the left side: on the right the ear of Эфир may still be up
    return (
      <g style={{ transformOrigin: "12px 38px", animation: "mascot-act-thumb 1.3s ease-in-out both" }}>
        <path d="M14 38 Q6 38 2.4 33" fill="none" stroke={body} strokeWidth="5.2" strokeLinecap="round" />
        <ellipse cx="-0.2" cy="31.4" rx="4.3" ry="3.9" fill={body} />
        <ellipse cx="-0.6" cy="25.8" rx="1.9" ry="3.3" transform="rotate(-8 -0.6 25.8)" fill={body} />
        <path d="M-2.2 30.2 h4.2 M-1.8 32.6 h3.8" stroke="var(--bg)" strokeOpacity="0.28" strokeWidth="0.9" strokeLinecap="round" />
      </g>
    );
  }
  if (act === "watch") {
    return (
      <g style={{ transformOrigin: "12px 42px", animation: "mascot-act-watch-arm 1.8s ease-in-out both" }}>
        <path d="M12 42 Q0 42 -1 30" fill="none" stroke={body} strokeWidth="5.2" strokeLinecap="round" />
        <ellipse cx="-1" cy="23.6" rx="3.8" ry="4.6" transform="rotate(-8 -1 23.6)" fill={body} />
        {/* the watch on the wrist, face to the viewer */}
        <rect x="-5.2" y="29.2" width="8.4" height="4" rx="1.2" fill="var(--text-muted)" />
        <circle cx="-1" cy="31.2" r="4.3" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.2" />
        <path d="M-1 31.2 H1.2" stroke="var(--text)" strokeWidth="1" strokeLinecap="round" />
        <path
          d="M-1 31.2 V28.2"
          stroke="var(--text)"
          strokeWidth="0.9"
          strokeLinecap="round"
          style={{ transformOrigin: "-1px 31.2px", animation: "mascot-act-watch-hand 1.8s linear both" }}
        />
      </g>
    );
  }
  return null;
}

/** In front of the body (after it, under the eyes): the medal on the chest, the hand at the brow. */
export function WorkActFront({ act, body }: { act: string; body: string }) {
  if (act === "medal") {
    // on the left of the chest, clear of the smile and of the stack on the right
    return (
      <g style={{ transformOrigin: "20px 40.6px", animation: "mascot-act-medal 2.4s both" }}>
        <path d="M15.2 40.6 L18.6 40.6 L21.4 47.6 L19 48.6 Z" fill="var(--danger)" />
        <path d="M24.8 40.6 L21.4 40.6 L18.6 47.6 L21 48.6 Z" fill="var(--danger)" />
        <path d="M16.9 40.6 L20 48 M23.1 40.6 L20 48" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="0.7" />
        <circle cx="20" cy="52.8" r="6" fill="var(--gold)" stroke="color-mix(in srgb, var(--gold) 55%, #000)" strokeWidth="1.1" />
        <path
          d="M20 49.4 L20.85 51.63 L23.23 51.75 L21.38 53.25 L22 55.55 L20 54.25 L18 55.55 L18.62 53.25 L16.77 51.75 L19.15 51.63 Z"
          fill="#ffffff"
          opacity="0.92"
        />
      </g>
    );
  }
  if (act === "wipe") {
    // the forearm and the hand travel together along the brow, a shade darker than the body —
    // the left hand, left to right: the right one holds the stack of a busy face
    return (
      <g transform={MIRROR}>
        <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-wipe-hand 1.8s ease-in-out both", opacity: 0 }}>
          <path d="M51.5 21.5 L60 31" fill="none" stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="6.2" strokeLinecap="round" />
          <path d="M51.5 21.5 L60 31" fill="none" stroke={handFill(body)} strokeWidth="4.6" strokeLinecap="round" />
          <ellipse cx="48" cy="19" rx="6" ry="3.4" transform="rotate(-8 48 19)" fill={handFill(body)} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
        </g>
      </g>
    );
  }
  if (act === "listen") {
    // the ear of `listening`, up for the length of the word to everyone
    return (
      <g style={{ transformOrigin: "53px 26px", animation: "mascot-act-ear 2s ease-in-out both" }}>
        <path d="M52 16 C58 8 69 12 68 22 C67.5 29 61 33 55 31 C53 30 51.5 28 52 26 Z" fill={body} />
        <path d="M56 19 C60 15.5 65.5 18.5 64.5 24 C64 27.5 60 29.5 57.5 27.5 C56 26.5 55.5 24.5 56.5 23 Z" fill="var(--bg)" opacity="0.26" />
      </g>
    );
  }
  return null;
}

const POOF_BITS: { x: number; y: number }[] = [
  { x: -12, y: -6 },
  { x: -7, y: -12 },
  { x: 2, y: -13 },
  { x: 10, y: -9 },
  { x: 13, y: 1 },
  { x: -11, y: 4 },
];

/** Over everything (after the face): what flies — the cards, the letter, the clock, the coin. */
export function WorkActOver({ act }: { act: string }) {
  switch (act) {
    case "catch":
    case "insist":
      return (
        <g style={{ transformOrigin: CARD_ORIGIN, animation: "mascot-act-drop 1.5s both", opacity: 0 }}>
          <CardOverHead badge={act === "insist" ? "insist" : "new"} stroke={act === "insist" ? "var(--danger)" : "var(--warn)"} />
        </g>
      );
    case "nod":
      return (
        <>
          <g style={{ transformOrigin: CARD_ORIGIN, animation: "mascot-act-stash 1.2s both", opacity: 0 }}>
            <CardOverHead badge={null} stroke="var(--accent)" />
          </g>
          <Tick at={{ x: 55, y: 9 }} timing="1.2s" />
        </>
      );
    case "raise":
      return (
        <g transform="translate(-2 -7)">
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-act-ask 1.8s both", opacity: 0 }}>
            <circle r="5.4" fill="var(--surface)" stroke="var(--warn)" strokeWidth="1.4" />
            <text y="0.4" fontSize="8" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="var(--warn)" fontFamily="var(--font-display), system-ui, sans-serif">
              ?
            </text>
          </g>
        </g>
      );
    case "shrug":
      return (
        <g style={{ transformOrigin: CARD_ORIGIN, animation: "mascot-act-aside 1.8s both", opacity: 0 }}>
          <CardOverHead badge={null} stroke="var(--text-muted)" />
        </g>
      );
    case "poof":
      return (
        <>
          <g style={{ transformOrigin: CARD_ORIGIN, animation: "mascot-act-poof-card 1.8s both", opacity: 0 }}>
            <CardOverHead badge={null} stroke="var(--text-muted)" />
          </g>
          <g fill="var(--text-muted)">
            {POOF_BITS.map((bit, index) => (
              <circle
                key={index}
                cx={CARD_AT.x}
                cy={CARD_AT.y}
                r={index % 2 ? 1.1 : 1.5}
                style={
                  {
                    "--px": `${bit.x}px`,
                    "--py": `${bit.y}px`,
                    transformBox: "fill-box",
                    transformOrigin: "50% 50%",
                    animation: "mascot-act-poof-bit 1.8s cubic-bezier(0.2, 0.7, 0.3, 1) both",
                    opacity: 0,
                  } as CSSProperties
                }
              />
            ))}
          </g>
        </>
      );
    case "handover":
      // the throw of «Отправляю», from this side: the card leaves the hand for the director (the
      // wind-up behind the head is WorkActUnder's)
      return (
        <g style={{ transformOrigin: "42px 12px", animation: "mascot-throw-card 1.2s linear both", opacity: 0 }}>
          <g transform="translate(42.5 11)">
            <CardShape badge="done" stroke="var(--ok)" />
          </g>
        </g>
      );
    case "medal":
      return (
        <g fill="var(--gold)">
          <path
            d="M8 12 L9.6 16.4 L14 18 L9.6 19.6 L8 24 L6.4 19.6 L2 18 L6.4 16.4 Z"
            style={{ transformOrigin: "8px 18px", animation: "mascot-act-spark 2.4s both", opacity: 0 }}
          />
          <path
            d="M57 4 L58.2 7.2 L61.4 8.4 L58.2 9.6 L57 12.8 L55.8 9.6 L52.6 8.4 L55.8 7.2 Z"
            style={{ transformOrigin: "57px 8.4px", animation: "mascot-act-spark 2.22s 0.18s both", opacity: 0 }}
          />
        </g>
      );
    case "boomerang":
      return (
        <g style={{ transformOrigin: CARD_ORIGIN, animation: "mascot-act-boomerang 2.2s both", opacity: 0 }}>
          <CardOverHead badge="back" stroke="var(--warn)" />
        </g>
      );
    case "relief":
      return (
        <g style={{ transformOrigin: "9px 6px", animation: "mascot-act-pop 1.8s ease-in-out both", opacity: 0 }}>
          <circle cx="9" cy="0" r="6.2" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.4" />
          <g stroke="var(--text-muted)" strokeWidth="0.9" strokeLinecap="round">
            <path d="M9 -5 v1.2 M9 5 v-1.2 M4 0 h1.2 M14 0 h-1.2" />
          </g>
          <path d="M9 0 L11.4 1.4" stroke="var(--text)" strokeWidth="1.2" strokeLinecap="round" />
          <path d="M9 0 V-3.9" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" style={{ transformOrigin: "9px 0px", animation: "mascot-act-rewind 1.8s both" }} />
          <circle cx="9" cy="0" r="0.9" fill="var(--text)" />
        </g>
      );
    case "letter":
      return (
        <g style={{ transformOrigin: `${LETTER_AT.x}px ${LETTER_AT.y}px`, animation: "mascot-act-letter 1.5s both", opacity: 0 }}>
          <g transform={`translate(${LETTER_AT.x} ${LETTER_AT.y}) rotate(-6)`}>
            <EnvelopeShape />
          </g>
        </g>
      );
    case "read":
      return (
        <g style={{ animation: "mascot-act-away 1.4s ease-in both" }}>
          <g transform={`translate(${LETTER_AT.x} ${LETTER_AT.y}) rotate(-6)`}>
            <EnvelopeShape open dot={false} />
          </g>
          <Tick at={{ x: LETTER_AT.x + 7, y: LETTER_AT.y - 6 }} timing="1.4s" />
        </g>
      );
    case "listen":
      return (
        <g fill="none" stroke="var(--gold)" strokeWidth="1.7" strokeLinecap="round">
          {[0, 1, 2].map((wave) => (
            <path
              key={wave}
              d={`M${66 + wave * 5} ${17 - wave * 2.5} a${8 + wave * 4} ${8 + wave * 4} 0 0 1 0 ${16 + wave * 5}`}
              style={{ transformOrigin: "62px 25px", animation: `mascot-wave-in 0.7s ease-out ${(0.2 + wave * 0.15).toFixed(2)}s 2 both`, opacity: 0 }}
            />
          ))}
        </g>
      );
    case "wipe":
      // the drop the hand flicks off at the end of the brow — mirrored with the hand (WorkActFront)
      return (
        <g transform={MIRROR}>
          <path
            d="M9 15 C12 19 12 22 9 22 C6 22 6 19 9 15 Z"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.2"
            style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-fling 1.8s both", opacity: 0 }}
          />
        </g>
      );
    case "coin":
      return (
        <g transform="translate(32 -6)">
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-coin 1.6s both", opacity: 0 }}>
            <circle r="5.4" fill="var(--gold)" stroke="color-mix(in srgb, var(--gold) 55%, #000)" strokeWidth="1.1" />
            <circle r="3.6" fill="none" stroke="#ffffff" strokeOpacity="0.45" strokeWidth="0.8" />
            <path d="M0 -2 V2 M-2 0 H2" stroke="#ffffff" strokeWidth="1.3" strokeLinecap="round" />
          </g>
        </g>
      );
    default:
      return null;
  }
}

/**
 * Under the body (drawn before it, outside its motion): the wind-up of «Сдал» — the card in the hand
 * behind the head, only its top over the crown; WorkActOver's copy takes over at the release.
 */
export function WorkActUnder({ act, body }: { act: string; body: string }) {
  if (act !== "handover") return null;
  return (
    <g data-still="hide" style={{ transformOrigin: "42px 12px", animation: "mascot-throw-card-back 1.2s linear both", opacity: 0 }}>
      <g transform="translate(42.5 11)">
        <CardShape badge="done" stroke="var(--ok)" />
      </g>
      <ellipse cx="35.4" cy="5.2" rx="3" ry="2.6" fill={handFill(body)} />
    </g>
  );
}

/* -------------------------------------------------------------------------- */
/* The director's side of the same card (tasks/020)                            */
/* -------------------------------------------------------------------------- */

/**
 * What the director's face plays when the board moves — the employee's steps and the director's
 * own decisions, read off two consecutive boards (components/pulse/thoughtActs.ts). The face of
 * the director has no feelings to show (D-70): every one of these is a gesture of an assistant
 * with the card in its hands — a tick, a card taken, a fist under the chin, a stamp, a flick, a
 * crumpled sheet, a push, the clock set forward, a note written back.
 */
export type BoardAct = "tick" | "receive" | "hmm" | "puzzle" | "stamp" | "flick" | "crumple" | "push" | "clock" | "reply";

/**
 * The board acts that take a hand. On «Задачи» (`checking`) the right hand holds the clipboard
 * and the left one the pencil — the pencil goes down for them, so there are never three hands.
 */
export const TAKES_HAND: ReadonlySet<string> = new Set(["hmm", "stamp", "flick", "crumple", "push", "clock", "reply"]);

/** Where a held card sits: in the right hand in front of the body, or on the clipboard of «Задачи». */
const HELD_AT = { x: 52, y: 46 };
const ON_BOARD = { x: 60, y: 45 };

/** A thumb over the left edge of a card held in the right hand, as the employee's stack has it. */
function HeldThumb({ body, animation }: { body: string; animation: string }) {
  return (
    <ellipse
      cx={HELD_AT.x - 8}
      cy={HELD_AT.y + 2.6}
      rx="2.3"
      ry="3.1"
      transform={`rotate(-18 ${HELD_AT.x - 8} ${HELD_AT.y + 2.6})`}
      fill={body}
      style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation, opacity: 0 }}
    />
  );
}

/** A crumpled sheet: a lumpy ball with two creases. */
function PaperBall() {
  return (
    <>
      <path d="M-5.4 -1 L-4 -4.4 L-1 -5.6 L2.2 -5 L5 -2.6 L5.6 0.8 L3.8 4 L0.6 5.4 L-2.8 4.8 L-5 2.6 Z" fill="var(--surface)" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinejoin="round" />
      {/* creases that never meet in the middle — a star there reads as an emblem, not paper */}
      <path d="M-3.6 -1.8 L-1.4 -0.6 L-0.2 -3 M1 1.2 L3.4 2 M-2.4 2.6 L-0.6 3.4" fill="none" stroke="var(--text-muted)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/** Behind the body: the arm that reaches up to the clock (the body covers its root). */
export function BoardActBehind({ act, body }: { act: string; body: string }) {
  if (act !== "clock") return null;
  return (
    <g style={{ transformOrigin: "12px 30px", animation: "mascot-act-clock-arm 1.8s ease-in-out both" }}>
      <path d="M12 30 Q5 20 13.4 11" fill="none" stroke={body} strokeWidth="5.2" strokeLinecap="round" />
      {/* the fingers on the crown of the clock, twisting it */}
      <g style={{ transformOrigin: "13.4px 10px", animation: "mascot-act-clock-twist 1.8s ease-in-out both" }}>
        <ellipse cx="14" cy="8.6" rx="3.6" ry="3" transform="rotate(-30 14 8.6)" fill={body} />
      </g>
    </g>
  );
}

/**
 * In front of the body, riding it: what the hands do with the card. `board` — the face holds the
 * clipboard of «Задачи»: the card lies on it instead of in a hand, and a gesture of two hands is
 * made with the free one.
 */
export function BoardActFront({ act, body, board }: { act: string; body: string; board: boolean }) {
  const hand = handFill(body);
  switch (act) {
    case "receive": {
      // the handed-in card comes up from below into the hand (onto the clipboard) and is read
      const at = board ? ON_BOARD : HELD_AT;
      return (
        <>
          <g style={{ transformOrigin: `${at.x}px ${at.y}px`, animation: "mascot-act-receive-card 1.6s both", opacity: 0 }}>
            <g transform={`translate(${at.x} ${at.y}) rotate(${board ? 3 : -4})`}>
              <CardShape badge="done" stroke="var(--ok)" />
            </g>
          </g>
          {board ? null : <HeldThumb body={body} animation="mascot-act-held-thumb 1.6s both" />}
        </>
      );
    }
    case "hmm":
      // a fist under the chin, knuckles up; on «Задачи» it is the left hand — the right one holds
      // the clipboard. A short thick forearm and a flat fist: a thin arm with a round end read as a
      // lollipop
      return (
        <g transform={board ? MIRROR : undefined}>
          <g style={{ transformBox: "fill-box", transformOrigin: "85% 100%", animation: "mascot-act-hmm-hand 1.8s ease-in-out both", opacity: 0 }}>
            <path d="M51 60 L40.5 53" fill="none" stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="7" strokeLinecap="round" />
            <path d="M51 60 L40.5 53" fill="none" stroke={hand} strokeWidth="5.4" strokeLinecap="round" />
            <g transform="rotate(-10 36 50)">
              <rect x="30.6" y="46.4" width="10.8" height="7.4" rx="3.2" fill={hand} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
              <path d="M33.6 46.8 v2.4 M36 46.6 v2.6 M38.4 46.8 v2.4" stroke="var(--bg)" strokeOpacity="0.35" strokeWidth="0.8" strokeLinecap="round" />
            </g>
          </g>
        </g>
      );
    case "stamp": {
      // the card held out in the left hand, clear of the face; the stamp comes down on it from above,
      // outside the head, so it never crosses an eye. On «Задачи» it comes down on the clipboard
      const at = board ? ON_BOARD : { x: -1, y: 51 };
      return (
        <g transform={`translate(${at.x} ${at.y})`}>
          {board ? null : (
            <g style={{ transformBox: "fill-box", transformOrigin: "50% 100%", animation: "mascot-act-stamp-card 1.8s both", opacity: 0 }}>
              <g transform="rotate(-5)">
                <CardShape badge={null} stroke="var(--accent)" />
              </g>
              {/* the thumb over the edge nearest the body */}
              <ellipse cx="8.4" cy="2" rx="2.3" ry="3.1" transform="rotate(-18 8.4 2)" fill={body} />
            </g>
          )}
          {/* what the stamp leaves: a tick in a ring */}
          <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-stamp-mark 1.8s both", opacity: 0 }}>
            <circle r="4.4" fill="none" stroke="var(--ok)" strokeWidth="1.3" />
            <path d="M-2.2 0.2 l1.6 1.7 l3 -3.3" fill="none" stroke="var(--ok)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </g>
          <g style={{ animation: "mascot-act-stamp-tool 1.8s both", opacity: 0 }}>
            <g transform="scale(1.2)">
              <ellipse cx="0" cy="-11.4" rx="3.4" ry="2.8" fill="var(--gold)" />
              <rect x="-1.5" y="-9.4" width="3" height="6.4" fill="color-mix(in srgb, var(--gold) 70%, var(--bg))" />
              <rect x="-5.8" y="-3.6" width="11.6" height="3.6" rx="1" fill="var(--gold)" />
              <rect x="-5.2" y="-0.9" width="10.4" height="0.9" fill="var(--ok)" />
              {/* the fist on the neck */}
              <ellipse cx="0" cy="-6.6" rx="3.4" ry="2.8" fill={hand} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" />
            </g>
          </g>
        </g>
      );
    }
    case "flick": {
      // the card sent back to redo leaves the hand with a flick of the wrist, down and away from the
      // body — never across the face
      const at = board ? ON_BOARD : HELD_AT;
      return (
        <>
          <g style={{ transformOrigin: `${at.x}px ${at.y}px`, animation: "mascot-act-flick-card 1.4s both", opacity: 0 }}>
            <g transform={`translate(${at.x} ${at.y}) rotate(4)`}>
              <CardShape badge={null} stroke="var(--warn)" />
              {/* the corner turned down in red: «не то» */}
              <path d="M4.6 -6.5 H9 V-2.1 Z" fill="var(--danger)" />
            </g>
          </g>
          {board ? (
            // the left hand's fingertip snaps it off the clipboard, outwards
            <ellipse
              cx={at.x - 11}
              cy={at.y + 1}
              rx="2.6"
              ry="2.2"
              fill={hand}
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-flick-finger 1.4s both", opacity: 0 }}
            />
          ) : (
            <HeldThumb body={body} animation="mascot-act-flick-thumb 1.4s both" />
          )}
        </>
      );
    }
    case "crumple": {
      // the revoked card is crushed in the fist into a ball, and the ball goes over the edge
      const at = board ? ON_BOARD : HELD_AT;
      return (
        <>
          <g style={{ transformOrigin: `${at.x}px ${at.y}px`, animation: "mascot-act-crumple-card 1.7s both", opacity: 0 }}>
            <g transform={`translate(${at.x} ${at.y}) rotate(4)`}>
              <CardShape badge={null} stroke="var(--text-muted)" />
            </g>
          </g>
          {board ? null : <HeldThumb body={body} animation="mascot-act-crumple-thumb 1.7s both" />}
          <g transform={`translate(${at.x} ${at.y})`}>
            <g style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-crumple-ball 1.7s both", opacity: 0 }}>
              <PaperBall />
            </g>
            <ellipse
              cx="-1"
              cy="2.6"
              rx="4.4"
              ry="3.6"
              fill={hand}
              stroke="var(--bg)"
              strokeOpacity="0.3"
              strokeWidth="0.8"
              style={{ transformBox: "fill-box", transformOrigin: "50% 50%", animation: "mascot-act-crumple-fist 1.7s both", opacity: 0 }}
            />
          </g>
        </>
      );
    }
    case "push":
      // «Настоять»: the card with «!!» is pushed forward with both hands and goes back out;
      // on «Задачи» the right hand keeps the clipboard, so it is the left one alone
      return (
        <g transform="translate(30 52)">
          <g style={{ transformOrigin: "0px 0px", animation: "mascot-act-push 1.6s both" }}>
            <g style={{ animation: "mascot-act-push-card 1.6s both", opacity: 0 }}>
              <CardShape badge="insist" stroke="var(--danger)" />
            </g>
            <g fill={hand} stroke="var(--bg)" strokeOpacity="0.3" strokeWidth="0.8" style={{ animation: "mascot-act-push-fists 1.6s both", opacity: 0 }}>
              <ellipse cx="-10.4" cy="1.4" rx="3.2" ry="3.6" />
              {board ? null : <ellipse cx="10.4" cy="1.4" rx="3.2" ry="3.6" />}
            </g>
          </g>
        </g>
      );
    case "reply": {
      // the answer to a question: the hand writes a note and the note goes up to the person
      // it goes up on the side it was written on: past the left eye, or off the clipboard on the right
      const at = board ? { x: 58, y: 44 } : { x: 18, y: 49 };
      return (
        <g transform={`translate(${at.x} ${at.y})`}>
          <g style={{ animation: `${board ? "mascot-act-reply-note-board" : "mascot-act-reply-note"} 2s both`, opacity: 0 }}>
            <g transform="rotate(-6)">
              <rect x="-8" y="-6" width="16" height="12" rx="1.8" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.4" />
              {[0, 1, 2].map((line) => (
                <path
                  key={line}
                  d={`M-5 ${-2.6 + line * 2.9} h${line === 2 ? 6 : 10}`}
                  stroke="var(--text-muted)"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  style={{ transformBox: "fill-box", transformOrigin: "0% 50%", animation: `mascot-act-reply-line 1.2s ease-out ${(0.32 + line * 0.2).toFixed(2)}s both` }}
                />
              ))}
            </g>
            {board ? null : <ellipse cx="-8.6" cy="1.6" rx="2.3" ry="3.1" transform="rotate(18 -8.6 1.6)" fill={body} />}
          </g>
          {/* the pen, and the fist on it, going along the lines */}
          <g style={{ animation: "mascot-act-reply-pen 2s both", opacity: 0 }}>
            <path d="M0.6 0.4 L6.4 -3.4" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" />
            <path d="M0.6 0.4 L1.9 -0.5" stroke="var(--text)" strokeWidth="1.8" strokeLinecap="round" />
            <ellipse cx="6.8" cy="-3.8" rx="2.8" ry="2.4" fill={hand} />
          </g>
        </g>
      );
    }
    default:
      return null;
  }
}

/** Over everything: what flies in or hangs by the head — the tick, the card with «?», the clock. */
export function BoardActOver({ act }: { act: string }) {
  switch (act) {
    case "tick":
      return <Tick at={{ x: 57, y: 13 }} timing="1.2s" />;
    case "puzzle":
      // on the left, clear of the watchful ear on the crown (D-70)
      return (
        <g style={{ transformOrigin: "11px -1px", animation: "mascot-act-puzzle-card 1.6s both", opacity: 0 }}>
          <g transform="translate(11 -1) rotate(-8)">
            <CardShape badge="ask" stroke="var(--warn)" />
          </g>
        </g>
      );
    case "clock":
      // a clock by the head; the minute hand is set forward — the deadline moved (or is gone)
      return (
        <g style={{ transformOrigin: "7px 1px", animation: "mascot-act-pop 1.8s ease-in-out both", opacity: 0 }}>
          <rect x="10.4" y="3.2" width="3" height="2.2" rx="0.6" transform="rotate(45 11.9 4.3)" fill="var(--text-muted)" />
          <circle cx="7" cy="1" r="6.6" fill="var(--surface)" stroke="var(--accent)" strokeWidth="1.4" />
          <g stroke="var(--text-muted)" strokeWidth="0.9" strokeLinecap="round">
            <path d="M7 -4.4 v1.2 M7 6.4 v-1.2 M1.6 1 h1.2 M12.4 1 h-1.2" />
          </g>
          <path d="M7 1 L9.2 2.2" stroke="var(--text)" strokeWidth="1.3" strokeLinecap="round" style={{ transformOrigin: "7px 1px", animation: "mascot-act-clock-hour 1.8s both" }} />
          <path d="M7 1 V-3.4" stroke="var(--accent)" strokeWidth="1.2" strokeLinecap="round" style={{ transformOrigin: "7px 1px", animation: "mascot-act-clock-minute 1.8s both" }} />
          <circle cx="7" cy="1" r="0.9" fill="var(--text)" />
        </g>
      );
    default:
      return null;
  }
}

/** The tick of a thing done, the badge of `processing` in small (D-65). */
function Tick({ at, timing }: { at: { x: number; y: number }; timing: string }) {
  return (
    <g style={{ transformOrigin: `${at.x}px ${at.y}px`, animation: `mascot-act-tick ${timing} both`, opacity: 0 }}>
      <circle cx={at.x} cy={at.y} r="6.4" fill="var(--ok)" />
      <path
        d={`M${at.x - 3} ${at.y + 0.4} l2.1 2.1 L${at.x + 3.3} ${at.y - 2.4}`}
        fill="none"
        stroke="var(--bg)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
