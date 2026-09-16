"use client";

import type { ReactNode } from "react";

import { Mascot, type MascotState } from "@/components/brand/Mascot";
import type { SpeechTone } from "@/lib/pulse/board";

const TONE_COLOR: Record<SpeechTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

export type AssistantLine = { id: string; text: string; tone?: SpeechTone };

type Props = {
  mascot: MascotState;
  /** The director's own words, when the assistant is answering a question. */
  said?: string | null;
  /** What the assistant says — one line for the moment, a few when it answers. */
  lines: AssistantLine[];
  /** A tap on the face repeats the opening line. */
  onReplay: () => void;
  /** Service lines (push, draft, chips) — under what the assistant says. */
  children?: ReactNode;
};

/**
 * The assistant on Пульс: the face and one line under it. The line appears at once
 * (a short fade, the mouth moves for a second) and is replaced by the next one — the
 * board below keeps the state, so nothing here has to be remembered or scrolled.
 */
export function Assistant({ mascot, said, lines, onReplay, children }: Props) {
  return (
    <section aria-label="Ассистент" className="flex flex-col items-stretch">
      <button
        type="button"
        onClick={onReplay}
        aria-label="Повторить сводку"
        className="mx-auto flex h-[128px] w-[128px] items-center justify-center rounded-full transition-transform duration-[120ms] active:scale-[0.96] [@media(max-height:760px)]:h-[104px] [@media(max-height:760px)]:w-[104px]"
      >
        {/* a short phone (iPhone SE class) gives the board one more tile instead of a larger face */}
        <span className="flex items-center justify-center [@media(max-height:760px)]:scale-[0.82]">
          <Mascot state={mascot} size={112} />
        </span>
      </button>

      <div className="mt-2 flex flex-col gap-2" aria-live="polite">
        {said ? (
          <div className="flex justify-end pt-1">
            <p className="max-w-[85%] rounded-[16px] rounded-tr-[6px] bg-surface-2 px-4 py-2 text-[16px] leading-[22px]">{said}</p>
          </div>
        ) : null}
        {lines.map((line) => (
          // keyed by id: a new line fades in as a whole, the old one is gone
          <p key={line.id} className="card-in relative py-1 pl-4 text-[17px] leading-6" data-testid="assistant-line">
            {line.tone ? <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full" style={{ background: TONE_COLOR[line.tone] }} /> : null}
            {line.text}
          </p>
        ))}
        {children}
      </div>
    </section>
  );
}
