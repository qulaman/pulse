"use client";

import type { ReactNode } from "react";

import type { MascotState } from "@/components/brand/Mascot";
import type { SpeechTone } from "@/lib/pulse/board";
import { MascotLever } from "./MascotLever";

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
  /** A tap on the face: the opening line again and the cards thrown anew. */
  onTap: () => void;
  /** Service lines (push, draft, chips) — under what the assistant says. */
  children?: ReactNode;
};

/**
 * The assistant on Пульс: the face is the lever of the screen (hold — listen, tap —
 * summary, pull down — text; D-60) and one line under it. The line appears at once
 * (a short fade, the mouth moves for a second) and is replaced by the next one — the
 * deck below keeps the state, so nothing here has to be remembered or scrolled.
 */
export function Assistant({ mascot, said, lines, onTap, children }: Props) {
  return (
    <section aria-label="Ассистент" className="flex flex-col items-stretch">
      <MascotLever state={mascot} onTap={onTap} size={128} />

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
