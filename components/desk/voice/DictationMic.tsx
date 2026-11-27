"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

import { MiniMark } from "@/components/brand/MiniMark";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { keysTaken } from "@/components/desk/ui/layers";
import { markPageRecording } from "@/components/desk/voice/control";
import { MicGlyph, RecordingPill } from "@/components/desk/voice/MicButton";
import { isTypingTarget } from "@/lib/desk/keys";
import { isVoiceKey, VOICE_KEY } from "@/lib/desk/voice";
import { toast } from "@/components/ui/Toast";
import type { Dictation, Receipt } from "@/lib/notes/dictation";
import { useIngestStore } from "@/lib/store/ingest";
import { elapsedSince } from "@/lib/voice/stages";

/**
 * The keys of a page's own dictaphone (D-177) — the same feel as the order line's (D-164): «V»
 * outside a field starts it; while it records Enter or «V» again saves, Esc drops it. Only while
 * the page holds the desk's voice (`useDeskVoiceClaim` → `isMine`) and the order line is not
 * recording a phrase of its own — one microphone at a time. An order phrase that is only on its
 * way (being parsed, waiting in the panel) does not hold the microphone: the page may listen.
 */
export function useDeskDictationKeys(dictation: Dictation, isMine: () => boolean): void {
  const live = useRef(dictation);
  useEffect(() => {
    live.current = dictation;
  });
  // the order line's microphone waits while this one listens (control.ts)
  const recording = dictation.stage === "recording";
  useEffect(() => {
    if (!recording) return;
    markPageRecording(true);
    return () => markPageRecording(false);
  }, [recording]);
  useEffect(() => {
    const onCapture = (event: KeyboardEvent) => {
      const d = live.current;
      if (d.stage !== "recording" || !isMine()) return;
      const enter = (event.code === "Enter" || event.code === "NumpadEnter") && !event.isComposing;
      const again = isVoiceKey(event) && !isTypingTarget(event.target);
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        d.cancel();
      } else if (enter || again) {
        event.preventDefault();
        event.stopImmediatePropagation();
        d.toggle();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isVoiceKey(event) || isTypingTarget(event.target) || keysTaken() || !isMine()) return;
      if (useIngestStore.getState().stage === "recording") return;
      const d = live.current;
      if (d.stage === "recording" || d.stage === "saving" || d.stage === "failed") return;
      event.preventDefault();
      d.toggle();
    };
    window.addEventListener("keydown", onCapture, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onCapture, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [isMine]);
}

/** The receipt of a dictaphone in words for a toast: «Записал: Банк…», «Микрофон: нет доступа. Разрешите…». */
export function receiptText(receipt: Receipt): string {
  if (receipt.tone === "ok" && receipt.eyebrow === "Записал") return `Записал: ${receipt.headline}`;
  const head = receipt.headline ? `${receipt.headline.charAt(0).toLowerCase()}${receipt.headline.slice(1)}` : "";
  return [`${receipt.eyebrow}${head ? `: ${head}` : ""}`, receipt.line].filter(Boolean).join(". ");
}

/**
 * The desk's way to show a dictaphone's receipt (D-177): a toast. Pass it as `onReceipt` to
 * `useDictation`, or call it from your own handler.
 */
export function toastReceipt(receipt: Receipt): void {
  toast(receiptText(receipt));
}

const BARS = 5;

/** The voice as it comes, painted into the nodes — no render per frame (as `LevelBars` of the order line). */
function Level({ subscribe }: { subscribe: Dictation["subscribeLevel"] }) {
  const box = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const history: number[] = Array.from({ length: BARS }, () => 0);
    let last = 0;
    return subscribe((value) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      history.shift();
      history.push(Math.min(1, Math.max(0, value)));
      const nodes = box.current?.children;
      if (!nodes) return;
      for (let i = 0; i < nodes.length; i += 1) (nodes[i] as HTMLElement).style.transform = `scaleY(${(0.18 + 0.82 * (history[i] ?? 0)).toFixed(3)})`;
    });
  }, [subscribe]);
  return (
    <span ref={box} aria-hidden className="inline-flex h-[14px] items-center gap-[2px]" data-testid="dictation-level">
      {Array.from({ length: BARS }, (_, i) => (
        <span key={i} className="block h-full w-[3px] rounded-[2px] bg-current" style={{ transform: "scaleY(0.18)", transition: "transform 60ms linear" }} />
      ))}
    </span>
  );
}

function Clock({ startedAt }: { startedAt: number | null }) {
  const node = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const paint = () => {
      if (node.current) node.current.textContent = elapsedSince(startedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [startedAt]);
  return (
    <span ref={node} className="nums text-[13px] font-medium leading-4">
      0:00
    </span>
  );
}

/** A small word-button of the failed state: «Повторить», «Удалить запись». */
const WORD = "desk-focus inline-flex h-8 shrink-0 items-center rounded-[8px] px-2.5 text-[13px] font-medium leading-4 transition-colors duration-[140ms] hover:bg-surface-2";

/**
 * A page's dictaphone button (D-177): the round microphone of the voice — the pen's colour, the
 * one coloured control of its card; a click listens, a click saves. While it listens — the order
 * line's pill (the time, the voice, «Готово») and a cross to drop it; while the recording goes to
 * its place — «Сохраняю…»; a recording that could not be saved anywhere (no IndexedDB, no
 * network) — «Повторить» and «Удалить запись», never dropped by itself. The words go verbatim
 * through `useDictation` (D-81): the recording is kept before any AI (principle 5).
 *
 * `keys` — the key the hint names (the page's «V» by default; a window whose field always holds the
 * caret names its own chord). `size` — 32 in a line of keys, 36 on a card of its own.
 */
export function DictationMic({
  dictation,
  label,
  testId = "dictation-mic",
  keys = [VOICE_KEY],
  size = 32,
}: {
  dictation: Dictation;
  label: string;
  testId?: string;
  keys?: string[];
  size?: 32 | 36;
}) {
  const stage = dictation.stage;

  if (stage === "recording") {
    return (
      <span className="inline-flex shrink-0 items-center gap-1" data-testid={`${testId}-live`}>
        <Tooltip label="Готово — сохранить" keys={["Enter"]} side="bottom">
          <RecordingPill
            onClick={() => dictation.toggle()}
            ariaLabel="Идёт запись. Нажмите, чтобы сохранить"
            testId={testId}
            className="rounded-[8px]"
            clock={<Clock startedAt={dictation.startedAt} />}
            level={<Level subscribe={dictation.subscribeLevel} />}
          />
        </Tooltip>
        <Tooltip label="Отменить запись" keys={["Esc"]} side="bottom">
          <button
            type="button"
            onClick={() => dictation.cancel()}
            aria-label="Отменить запись"
            data-testid={`${testId}-cancel`}
            className="desk-focus flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors duration-[140ms] hover:bg-surface-2 hover:text-text"
          >
            <X aria-hidden size={16} />
          </button>
        </Tooltip>
      </span>
    );
  }

  if (stage === "saving") {
    return (
      <span role="status" className="inline-flex h-8 shrink-0 items-center gap-2 px-2.5 text-[13px] leading-4 text-muted" data-testid={testId} data-recording="0" data-stage="saving">
        {/* the mascot's small self at work (D-209), as on every «Сохраняю…» */}
        <MiniMark state="busy" size={16} tone="var(--accent)" />
        Сохраняю…
      </span>
    );
  }

  if (stage === "failed") {
    return (
      <span role="alert" className="inline-flex shrink-0 items-center gap-1" data-testid={testId} data-recording="0" data-stage="failed">
        <span className="px-1 text-[13px] leading-4 text-danger">Голос не сохранился</span>
        <button type="button" onClick={() => dictation.retry()} className={`${WORD} text-text`} data-testid={`${testId}-retry`}>
          Повторить
        </button>
        <button type="button" onClick={() => dictation.discard()} className={`${WORD} text-muted hover:text-danger`} data-testid={`${testId}-discard`}>
          Удалить запись
        </button>
      </span>
    );
  }

  const box = size === 36 ? "h-9 w-9" : "h-8 w-8";
  return (
    <Tooltip label={label} keys={keys} side="bottom">
      <button
        type="button"
        onClick={() => {
          // one microphone at a time: an order phrase still recording in the line comes first
          if (useIngestStore.getState().stage === "recording") {
            toast("Сначала закончите поручение голосом — «Готово» в строке сверху");
            return;
          }
          dictation.toggle();
        }}
        aria-label={label}
        data-testid={testId}
        data-recording="0"
        data-stage={stage}
        className={`desk-focus flex ${box} shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-[filter,scale] duration-[140ms] hover:brightness-110 active:scale-[.94] active:duration-[80ms]`}
        style={{ boxShadow: "0 0 0 1px color-mix(in srgb, var(--accent) 50%, transparent), 0 6px 18px -8px color-mix(in srgb, var(--accent) 80%, transparent)" }}
      >
        <MicGlyph size={size === 36 ? 18 : 16} />
      </button>
    </Tooltip>
  );
}
