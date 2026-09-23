"use client";

import { onlineManager } from "@tanstack/react-query";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Body, Dot, Key, Lcd, LcdDim, Lens, type LedTone } from "@/components/ui/device/Device";
import type { NoteFilter, NotesSummary } from "@/lib/notes/list";
import type { Dictation, Receipt } from "@/lib/notes/dictation";
import { tvTime } from "@/lib/tv/clock";

import { NoteIcon } from "./icons";
import css from "./notes.module.css";

/**
 * The head of «Заметки», read as a dictaphone (D-81) and built from the device kit of
 * the TV remote and «Задачи» (D-80 §1): the lens is the receipt of the last write, the
 * display says what is happening to the thought — listening, saving, transcribing,
 * saved — and the key under the thumb is the microphone. Typing goes into the well next
 * to it; the round key turns into «записать» as soon as there is text.
 */

const EYEBROW = "font-display text-[11px] font-semibold uppercase leading-4 tracking-[0.1em]";

export const FILTERS: { key: NoteFilter; label: string }[] = [
  { key: "active", label: "Мысли" },
  { key: "converted", label: "В деле" },
  { key: "trash", label: "Корзина" },
];

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

/** The clock on the display melts on its own: every 10 s is enough. */
function useTick(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function clock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const BARS = 32;

/**
 * The last seconds of the voice as a strip of bars. The level arrives ~60 times a
 * second; the strip takes a sample every 70 ms and writes `transform` straight to the
 * bars — React renders it once.
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
    <div ref={strip} className={css.meter} aria-hidden>
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

type Props = {
  summary: NotesSummary;
  /** The receipt of the last write, shown for a few seconds. */
  receipt: Receipt | null;
  dictation: Dictation;
  /** A note write is on its way: the lens blinks. */
  writing: boolean;
  filter: NoteFilter;
  counts: Record<NoteFilter, number>;
  onFilter: (next: NoteFilter) => void;
  /** Typed text: already a note, no parser (D-75 §6). */
  onWrite: (text: string) => void;
  /** The microphone opened: the page turns to the feed, where the note will land. */
  onCapture: () => void;
};

export function NotesDevice({ summary, receipt, dictation, writing, filter, counts, onFilter, onWrite, onCapture }: Props) {
  const now = useTick();
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);
  const [draft, setDraft] = useState("");
  const [armed, setArmed] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);

  const { stage } = dictation;
  const recording = stage === "recording";
  const failed = stage === "failed";
  const mode = failed ? "discard" : recording ? "stop" : draft.trim() ? "send" : "mic";

  // autogrow up to five lines; past that the well scrolls
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
  const led: LedTone = failed ? "warn" : busy ? "accent" : !online ? "warn" : receipt ? receipt.tone : "ok";

  const eyebrow = (left: string, right?: React.ReactNode) => (
    <div className="flex items-center justify-between gap-3">
      <LcdDim className={`${EYEBROW} truncate`}>{left}</LcdDim>
      <LcdDim className="nums shrink-0 text-[12px] leading-4">{right ?? tvTime(now)}</LcdDim>
    </div>
  );

  const toneColor = (tone: "ok" | "warn") => (tone === "ok" ? "var(--ok)" : "var(--warn)");

  let screen: React.ReactNode;
  if (recording) {
    screen = (
      <>
        {eyebrow(dictation.latched ? "Запись · замок" : "Запись", <Timer startedAt={dictation.startedAt} />)}
        <div className="mt-3">
          <LevelMeter subscribe={dictation.subscribeLevel} />
        </div>
        <p className="mt-2.5 truncate text-[13px] leading-[18px]">
          {dictation.latched ? "Нажми ■ — сохраню · «Отмена» — не сохраню" : "Отпусти — сохраню"}
        </p>
      </>
    );
  } else if (stage === "saving") {
    screen = (
      <>
        {eyebrow("Сохраняю")}
        <p className="mt-2 truncate font-display text-[24px] font-bold leading-8 tracking-[-0.02em]">Кладу запись</p>
        <p className="mt-1 truncate text-[13px] leading-[18px]">Сначала голос, потом слова</p>
      </>
    );
  } else if (failed) {
    screen = (
      <>
        {eyebrow(online ? "Не отправилось" : "Нет связи")}
        <p className="mt-2 truncate font-display text-[24px] font-bold leading-8 tracking-[-0.02em]">Запись у меня</p>
        <p className="mt-1 truncate text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
          {armed ? "Ещё раз ✕ — удалю запись насовсем" : "«Повторить» — отправлю снова"}
        </p>
      </>
    );
  } else if (stage === "transcribing" && !receipt) {
    screen = (
      <>
        {eyebrow("Распознаю")}
        <p className="mt-2 truncate font-display text-[24px] font-bold leading-8 tracking-[-0.02em]">Голос сохранён</p>
        <p className="mt-1 truncate text-[13px] leading-[18px]">Слова появятся через пару секунд</p>
      </>
    );
  } else if (receipt) {
    screen = (
      <>
        {eyebrow(receipt.eyebrow)}
        <p className="mt-2 line-clamp-2 font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">{receipt.headline}</p>
        <p className="mt-1 truncate text-[13px] leading-[18px]" style={{ color: toneColor(receipt.tone) }}>
          {receipt.line}
        </p>
      </>
    );
  } else {
    screen = (
      <>
        {eyebrow(summary.eyebrow)}
        <p data-testid="notes-headline" className="mt-2 truncate font-display text-[26px] font-bold leading-8 tracking-[-0.02em]">
          {summary.headline}
        </p>
        <p className="mt-1 truncate text-[13px] leading-[18px]">{summary.line}</p>
        <LcdDim className="mt-0.5 block truncate text-[13px] leading-[18px]">{summary.second}</LcdDim>
      </>
    );
  }

  const roundIcon = mode === "stop" ? "stop" : mode === "send" ? "up" : mode === "discard" ? "x" : "mic";
  const roundLabel =
    mode === "stop" ? "Закончить запись" : mode === "send" ? "Записать заметку" : mode === "discard" ? "Удалить запись" : "Диктовать заметку";

  return (
    <Body className="mx-auto w-full max-w-[380px]">
      <Lens tone={led} blink={busy} />

      <div data-testid="notes-lcd" className="mt-3" aria-live="polite">
        <Lcd>
          <div className="min-h-[102px]">{screen}</div>
        </Lcd>
      </div>

      <div className="mt-3 flex items-center gap-2">
        {recording ? (
          <Key className="min-w-0 flex-1" icon={<NoteIcon name="x" size={18} />} data-testid="dictation-cancel" onClick={dictation.cancel}>
            Отмена
          </Key>
        ) : failed ? (
          <Key className="min-w-0 flex-1" icon={<NoteIcon name="retry" size={18} />} data-testid="dictation-retry" onClick={dictation.retry}>
            Повторить
          </Key>
        ) : (
          <label className={css.well}>
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
              placeholder="Написать мысль…"
              aria-label="Новая заметка"
              data-testid="note-draft"
            />
          </label>
        )}

        <Key
          round
          on={recording}
          icon={<NoteIcon name={roundIcon} size={22} />}
          aria-label={roundLabel}
          data-testid="dictation-key"
          data-mode={mode}
          // the walkie-talkie contract of the FAB (FRONTEND «FAB»): a held key is not a scroll
          style={{ WebkitTouchCallout: "none", touchAction: "none" }}
          onContextMenu={(event) => event.preventDefault()}
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
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2" role="group" aria-label="Какие заметки показать">
        {FILTERS.map((item) => (
          <Key key={item.key} on={filter === item.key} data-testid={`notes-filter-${item.key}`} onClick={() => onFilter(item.key)}>
            <span>{item.label}</span>
            <span className="nums text-[12px] leading-4 opacity-70">{counts[item.key]}</span>
          </Key>
        ))}
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {FILTERS.map((item) => (
          <span key={item.key} className="flex justify-center">
            <Dot on={filter === item.key} />
          </span>
        ))}
      </div>
    </Body>
  );
}
