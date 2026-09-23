"use client";

import { onlineManager } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import type { Dictation, Receipt } from "@/lib/notes/dictation";
import type { NotesHero } from "@/lib/notes/list";
import { TONE_VAR, type Tone } from "@/lib/tasks/tone";

import { NoteIcon } from "./icons";
import css from "./notes.module.css";

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const BARS = 36;

/**
 * The last seconds of the voice as a strip of bars. The level arrives ~60 times a second;
 * the strip samples it every 70 ms and writes `transform` straight to the bars — React
 * renders it once.
 */
function LevelMeter({ subscribe }: { subscribe: Dictation["subscribeLevel"] }) {
  const strip = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const history = new Array<number>(BARS).fill(0);
    let peak = 0;
    let last = 0;
    return subscribe((level) => {
      peak = Math.max(peak, level);
      const now = performance.now();
      if (now - last < 70) return;
      last = now;
      history.shift();
      history.push(peak);
      peak = 0;
      const bars = strip.current?.children;
      if (!bars) return;
      for (let i = 0; i < bars.length; i += 1) {
        (bars[i] as HTMLElement).style.transform = `scaleY(${(0.08 + Math.min(1, history[i] * 1.6) * 0.92).toFixed(3)})`;
      }
    });
  }, [subscribe]);
  return (
    <div ref={strip} className={css.meter} style={{ color: "var(--accent)" }} aria-hidden>
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className={css.bar} />
      ))}
    </div>
  );
}

/** Minutes and seconds since the microphone opened, written into the text node directly. */
function Timer({ startedAt }: { startedAt: number | null }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      if (node.current) node.current.textContent = clock(startedAt ? Date.now() - startedAt : 0);
    };
    paint();
    const id = setInterval(paint, 250);
    return () => clearInterval(id);
  }, [startedAt]);
  return <span ref={node} className="nums" />;
}

/** What the screen says between captures, when it is not the thoughts' hero — a board (D-102). */
export type RecorderIdle = { eyebrow: string; right?: ReactNode; body: ReactNode };

/** The words of the input row: a board asks for a point, not for a thought. */
export type RecorderWords = { placeholder: string; field: string; record: string; write: string };

const NOTE_WORDS: RecorderWords = {
  placeholder: "Написать мысль…",
  field: "Новая заметка",
  record: "Диктовать заметку",
  write: "Записать заметку",
};

type Props = {
  hero?: NotesHero;
  /** Replaces the thoughts' hero between captures. */
  idle?: RecorderIdle;
  words?: RecorderWords;
  /** The receipt of the last write, shown for a few seconds. */
  receipt: Receipt | null;
  dictation: Dictation;
  /** A note write is on its way: the dot breathes. */
  writing: boolean;
  /** Typed text: already a note, no parser (D-75 §6). */
  onWrite: (text: string) => void;
  /** The microphone opened: the page turns to the feed, where the note will land. */
  onCapture: () => void;
};

/**
 * The head of «Заметки» (D-93) in the language of «Задачи» (D-83): a status screen that
 * says what the thoughts are — how many, the latest, the week — and turns into the
 * recorder while the director talks: the timer, the voice as a strip of bars, «Сохраняю»,
 * «Распознаю», «Записал». Under it, inside the same screen, the field for a typed thought
 * and the round microphone: hold it and talk, or tap it and talk until the next tap (D-81).
 */
export function NotesRecorder({ hero, idle, words = NOTE_WORDS, receipt, dictation, writing, onWrite, onCapture }: Props) {
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const { stage } = dictation;
  const recording = stage === "recording";
  const failed = stage === "failed";
  const mode = failed ? "discard" : recording ? "stop" : draft.trim() ? "send" : "mic";

  // autogrow up to five lines; past that the field scrolls
  useEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight, 118)}px`;
  }, [draft]);

  // «Удалить запись» needs a second tap within three seconds — the recording is gone for good
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 3_000);
    return () => clearTimeout(timer);
  }, [armed]);

  const send = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    onWrite(text);
  };

  const busy = recording || stage === "saving" || stage === "transcribing" || writing;
  const tone: Tone = failed || !online ? "warn" : recording || busy ? "accent" : receipt ? receipt.tone : "accent";

  // the words of the screen: what is happening to the thought right now, else the thoughts
  let eyebrow: string;
  let right: ReactNode = null;
  let body: ReactNode;
  if (recording) {
    eyebrow = dictation.latched ? "Запись · замок" : "Запись";
    body = (
      <>
        <div className="flex items-end justify-between gap-3">
          <span className="font-display text-[34px] font-bold leading-[36px] tracking-[-0.03em]" style={{ color: "var(--accent)" }}>
            <Timer startedAt={dictation.startedAt} />
          </span>
          <span className="pb-1 text-[13px] leading-[18px] text-muted">
            {dictation.latched ? "■ — сохраню · «Отмена» — нет" : "Отпустите — сохраню"}
          </span>
        </div>
        <div className="mt-2">
          <LevelMeter subscribe={dictation.subscribeLevel} />
        </div>
      </>
    );
  } else if (stage === "saving") {
    eyebrow = "Сохраняю";
    body = <Big title="Кладу запись" line="Сначала голос, потом слова" />;
  } else if (failed) {
    eyebrow = online ? "Не отправилось" : "Нет связи";
    body = <Big title="Запись у меня" line={armed ? "Ещё раз ✕ — удалю запись насовсем" : "«Повторить» — отправлю снова"} lineTone="warn" />;
  } else if (stage === "transcribing" && !receipt) {
    eyebrow = "Распознаю";
    body = <Big title="Голос сохранён" line="Слова появятся через пару секунд" />;
  } else if (receipt) {
    eyebrow = receipt.eyebrow;
    body = <Big title={receipt.headline} line={receipt.line} lineTone={receipt.tone} clamp />;
  } else if (idle) {
    eyebrow = idle.eyebrow;
    right = idle.right ?? null;
    body = idle.body;
  } else if (hero) {
    eyebrow = "Мои мысли";
    right = (
      <span className="inline-flex items-center gap-1.5 text-[12px] leading-4 text-muted">
        <NoteIcon name="lock" size={12} />
        только вам
      </span>
    );
    body = (
      <div className="flex h-full items-center gap-3.5">
        {hero.value !== null ? (
          <span data-testid="notes-headline" className="nums shrink-0 text-[48px] font-bold leading-[48px] tracking-[-0.04em]" style={{ color: "var(--accent)" }}>
            {hero.value}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.015em]">{hero.label}</p>
          <p className="mt-0.5 truncate text-[13px] leading-[18px] text-muted">{hero.detail}</p>
          <p className="truncate text-[13px] leading-[18px] text-muted">{hero.second}</p>
        </div>
      </div>
    );
  } else {
    eyebrow = "";
    body = null;
  }

  const roundIcon = mode === "stop" ? "stop" : mode === "send" ? "up" : mode === "discard" ? "x" : "mic";
  const roundLabel = mode === "stop" ? "Закончить запись" : mode === "send" ? words.write : mode === "discard" ? "Удалить запись" : words.record;

  return (
    <section
      data-testid="notes-lcd"
      aria-live="polite"
      className="status-screen rounded-[22px] px-4 pb-3.5 pt-3.5"
      style={{ "--tone": TONE_VAR[tone] } as CSSProperties}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex min-w-0 items-center gap-2 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em]" style={{ color: TONE_VAR[tone] }}>
          <span
            aria-hidden
            className="h-[7px] w-[7px] shrink-0 rounded-full"
            style={{ background: TONE_VAR[tone], boxShadow: `0 0 10px ${TONE_VAR[tone]}`, animation: busy ? "shimmer 1s ease-in-out infinite" : undefined }}
          />
          <span className="truncate">{eyebrow}</span>
        </span>
        {right}
      </div>

      <div className="mt-2.5 h-[82px] overflow-hidden">{body}</div>

      {/* the input, inside the same screen: a typed thought or the microphone */}
      <div className="mt-3 flex items-end gap-2.5 border-t border-border/60 pt-3">
        {recording ? (
          <Button variant="secondary" className="min-h-[56px] flex-1" icon={<NoteIcon name="x" size={18} />} data-testid="dictation-cancel" onClick={dictation.cancel}>
            Отмена
          </Button>
        ) : failed ? (
          <Button variant="secondary" className="min-h-[56px] flex-1" icon={<NoteIcon name="retry" size={18} />} data-testid="dictation-retry" onClick={dictation.retry}>
            Повторить
          </Button>
        ) : (
          <label className="flex min-h-[56px] min-w-0 flex-1 cursor-text items-center rounded-[18px] field px-3.5 py-2">
            <textarea
              ref={field}
              value={draft}
              rows={1}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                // Ctrl/Cmd+Enter writes; plain Enter keeps the thought going on a new line
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault();
                  send();
                }
              }}
              placeholder={words.placeholder}
              aria-label={words.field}
              data-testid="note-draft"
              className="block max-h-[118px] w-full resize-none bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted"
            />
          </label>
        )}

        <span className="relative shrink-0">
          {recording ? <span aria-hidden className="absolute inset-0 rounded-full border-2 border-accent" style={{ animation: "pick-pulse 1.4s ease-out infinite" }} /> : null}
          <button
            type="button"
            aria-label={roundLabel}
            data-testid="dictation-key"
            data-mode={mode}
            // the walkie-talkie contract: a held key is not a scroll
            style={{ WebkitTouchCallout: "none", touchAction: "none" }}
            onContextMenu={(event) => event.preventDefault()}
            className={`relative flex h-14 w-14 items-center justify-center rounded-full transition-transform duration-[120ms] active:scale-[0.94] ${
              mode === "discard" ? "border border-warn/60 text-warn" : "btn-primary text-bg"
            }`}
            onPointerDown={(event) => {
              if (mode !== "mic" && mode !== "stop") return;
              // the finger may slide off the key while talking: the release still comes here
              event.currentTarget.setPointerCapture?.(event.pointerId);
              if (mode === "mic") onCapture();
              dictation.press();
            }}
            onPointerUp={() => {
              if (mode === "mic" || mode === "stop") dictation.release();
            }}
            onPointerCancel={() => {
              // the browser took the gesture (a scroll): whatever was said is saved, not lost
              if (recording) dictation.release();
            }}
            onClick={(event) => {
              if (mode === "send") send();
              else if (mode === "discard") {
                if (armed) {
                  setArmed(false);
                  dictation.discard();
                } else setArmed(true);
              } else if (event.detail === 0) {
                // Enter or Space: no hold on a keyboard, so the key is a toggle
                if (mode === "mic") onCapture();
                dictation.toggle();
              }
            }}
          >
            <NoteIcon name={roundIcon} size={24} />
          </button>
        </span>
      </div>
      <p className={`mt-2 text-center text-[12px] leading-4 text-muted ${mode === "mic" ? "" : "invisible"}`} aria-hidden={mode !== "mic"}>
        удержите — говорите · тап — старт и стоп
      </p>
    </section>
  );
}

function Big({ title, line, lineTone, clamp = false }: { title: string; line: string; lineTone?: "ok" | "warn"; clamp?: boolean }) {
  return (
    <>
      <p className={`${clamp ? "line-clamp-2" : "truncate"} font-display text-[20px] font-bold leading-[26px] tracking-[-0.02em]`}>{title}</p>
      <p className="mt-1 truncate text-[13px] leading-[18px]" style={{ color: lineTone ? TONE_VAR[lineTone] : "var(--text-muted)" }}>
        {line}
      </p>
    </>
  );
}
