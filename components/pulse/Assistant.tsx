"use client";

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { lineKeyOf, runsOf, sayAll, GHOST_SHIFT_S, type Anim, type Ink, type Said, type SaidLine, type Tint, type Token, type Word } from "@/lib/pulse/said";

import styles from "./Assistant.module.css";

export type AssistantLine = SaidLine;

type Props = {
  /** The director's own words, when the assistant is answering a question. */
  said?: string | null;
  /** What the assistant says — one line for the moment, a few when it answers. A new `id` is a new line. */
  lines: AssistantLine[];
  /** The ways out of an answer («Сделать задачей», «Закрыть»), under the words. */
  children?: ReactNode;
};

const TINT_CLASS: Record<Tint, string> = { text: styles.text!, danger: styles.danger!, warn: styles.warn!, ok: styles.ok! };

/** The classes of an ink: none for the grey frame. */
function classOf(ink: Ink): string {
  if (ink === "") return "";
  const [tint, bold] = ink.split(" ") as [Tint, string | undefined];
  return bold ? `${TINT_CLASS[tint]} ${styles.bold}` : TINT_CLASS[tint];
}

const ANIM_CLASS: Record<Anim, string> = { rise: "", shine: styles.shine!, flare: styles.flare! };

function WordView({ word }: { word: Word }) {
  const one = word.frags.every((f) => f.ink === word.frags[0]!.ink);
  const cls = [styles.w, ANIM_CLASS[word.anim], one ? classOf(word.frags[0]!.ink) : ""].filter(Boolean).join(" ");
  const style = { "--d": `${word.at.toFixed(3)}s`, ...(word.hue ? { "--glow": `var(--${word.hue})` } : null) } as CSSProperties;
  return (
    // data-at / data-greet: the ghost of this reply shows only what had been said (see Assistant)
    <span className={cls} style={style} data-at={word.at.toFixed(3)} data-greet={word.greet ? "" : undefined}>
      {/* an inner span only where one word mixes two looks («просрочка» + its grey comma) */}
      {one
        ? word.word
        : word.frags.map((frag, j) =>
            frag.ink ? (
              <span key={j} className={classOf(frag.ink)}>
                {frag.text}
              </span>
            ) : (
              frag.text
            ),
          )}
    </span>
  );
}

function Words({ tokens }: { tokens: Token[] }): ReactNode {
  // keys by the words themselves: the same words keep their boxes, new ones come in
  const seen = new Map<string, number>();
  const keyOf = (word: string) => {
    const n = seen.get(word) ?? 0;
    seen.set(word, n + 1);
    return `${word}~${n}`;
  };
  return runsOf(tokens).map((run) => {
    const nodes = run.map((token) => ("space" in token ? token.space : <WordView key={keyOf(token.word)} word={token} />));
    const first = run.find((t): t is Word => "word" in t);
    return run.length > 1 && first ? (
      <span key={keyOf(`run:${first.word}`)} className={styles.keep}>
        {nodes}
      </span>
    ) : (
      nodes
    );
  });
}

/** A line on screen: its words and clock as they were when it came (`said`), and its own wait. */
type Live = { k: string; said: Said; shift: number };

function Lines({ lines, live }: { lines: Live[]; live: boolean }) {
  return lines.map(({ k, said: line, shift }) => (
    <p
      // keyed by id and words: a line that stays is not said again, a line whose words changed is new
      key={k}
      className={`${styles.line} ${line.head ? styles.head : styles.detail}`}
      style={{ "--shift": `${shift}s` } as CSSProperties}
      data-testid={live ? "assistant-line" : undefined}
      data-k={k}
    >
      {line.kicker ? (
        <span className={styles.kicker}>
          <Words tokens={line.kicker} />
        </span>
      ) : null}
      {line.between}
      <Words tokens={line.body} />
    </p>
  ));
}

function Mic() {
  return (
    <svg aria-hidden className={styles.mic} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2.5" width="6" height="11.5" rx="3" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** A reply as it now stands: its lines, the ones that stayed reused as they are. */
function nextLives(lines: AssistantLine[], before: Live[]): { lives: Live[]; gone: Live[] } {
  const keys = lines.map(lineKeyOf);
  const was = new Map(before.map((live) => [live.k, live]));
  const kept = new Set(keys.filter((k) => was.has(k)));
  const gone = before.filter((live) => !kept.has(live.k));
  // the new lines wait while the gone ones lift away; a line only added waits for nothing
  const shift = gone.length > 0 ? GHOST_SHIFT_S : 0;
  const fresh = sayAll(lines, kept).said;
  const lives = keys.map((k, i): Live => {
    const stayed = was.get(k);
    return stayed ? { ...stayed, said: { ...stayed.said, head: i === 0 } } : { k, said: fresh[i]!, shift };
  });
  return { lives, gone };
}

/**
 * What the assistant says, under its face (D-181): live captions — no dot, no frame, no bubble. The
 * words come in the rhythm of a voice, one clock through the whole reply (`lib/pulse/said.ts`): a
 * syllable's time each, a breath after a comma, a full stop and a line; the greeting goes first as a
 * quiet row of its own, twice as fast. The frame of the phrase rises grey; who and what are white;
 * the counts and times of the headline stand up in white 600 with a soft light (two at most — more
 * would be a wall); the line's verdict — one unit, in its tone's colour — flares in that colour as it
 * is said. A line that stays is not said again; a new one is said from its own start, and the lines
 * that left lift away as a ghost from where they stood, with only the words that had been said. The
 * director's own question sits above, quiet, after a microphone. All one-shot CSS: nothing runs once
 * the last word has cooled, as the mouth stops; sizes never jump.
 */
export function Assistant({ said, lines, children }: Props) {
  const key = lines.map(lineKeyOf).join("\u0002");
  // the reply on screen, and the lines that have just left it while they lift away
  const [shown, setShown] = useState(() => ({ key, lives: nextLives(lines, []).lives }));
  const [ghost, setGhost] = useState<{ id: number; lives: Live[] } | null>(null);
  if (shown.key !== key) {
    const next = nextLives(lines, shown.lives);
    if (next.gone.length > 0) setGhost({ id: (ghost?.id ?? 0) + 1, lives: next.gone });
    setShown({ key, lives: next.lives });
  }

  const root = useRef<HTMLDivElement>(null);
  const ghostBox = useRef<HTMLDivElement>(null);
  /** when each line on screen set out (`performance.now()`), by its key */
  const born = useRef(new Map<string, number>());
  /** how high each line's bottom stands over the block's bottom, by its key */
  const lows = useRef(new Map<string, number>());

  // 1. the ghost: every line just gone where it stood, with only what had been said of it by its own
  //    clock; a greeting alone is no ghost. Declared first: it reads the clocks and places as they were
  useLayoutEffect(() => {
    const box = ghostBox.current;
    if (!box || !ghost) return;
    const now = performance.now();
    let news = false;
    ghost.lives.forEach(({ k, shift }, i) => {
      const line = box.children[i] as HTMLElement | undefined;
      if (!line) return;
      line.style.bottom = `${lows.current.get(k) ?? 0}px`;
      const heard = (now - (born.current.get(k) ?? 0)) / 1000 - shift;
      line.querySelectorAll<HTMLElement>("[data-at]").forEach((w) => {
        const out = Number(w.dataset.at) <= heard;
        w.style.visibility = out ? "" : "hidden";
        if (out && w.dataset.greet === undefined) news = true;
      });
    });
    if (!news) box.style.display = "none";
  }, [ghost]);
  // 2. after every render: when the new lines set out, and where every line ends
  useLayoutEffect(() => {
    const now = performance.now();
    const keep = new Set([...shown.lives, ...(ghost?.lives ?? [])].map((live) => live.k));
    for (const k of born.current.keys()) if (!keep.has(k)) born.current.delete(k);
    for (const { k } of shown.lives) if (!born.current.has(k)) born.current.set(k, now);
    const box = root.current;
    lows.current.clear();
    if (!box) return;
    const bottom = box.getBoundingClientRect().bottom;
    box.querySelectorAll<HTMLElement>(":scope > p[data-testid]").forEach((line) => {
      lows.current.set(line.dataset.k ?? "", bottom - line.getBoundingClientRect().bottom);
    });
  });
  useEffect(() => {
    if (!ghost) return;
    // the ghost goes on its animation's end; this is the net under it (reduced motion has no animation)
    const timer = setTimeout(() => setGhost((g) => (g === ghost ? null : g)), 400);
    return () => clearTimeout(timer);
  }, [ghost]);

  if (!said && lines.length === 0 && !children) return null;
  return (
    <div ref={root} className={styles.root} aria-live="polite">
      {said ? (
        <p key={said} className={styles.said}>
          <Mic />«{said}»
        </p>
      ) : null}
      <Lines lines={shown.lives} live />
      {/* the ways out are there at once: a button is never hidden while it can be tapped */}
      {children ? <div className={styles.after}>{children}</div> : null}
      {ghost ? (
        <div key={ghost.id} ref={ghostBox} aria-hidden className={styles.ghost} onAnimationEnd={(e) => e.target === e.currentTarget && setGhost(null)}>
          <Lines lines={ghost.lives} live={false} />
        </div>
      ) : null}
    </div>
  );
}
