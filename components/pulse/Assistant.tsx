"use client";

import type { ReactNode } from "react";

import type { SpeechTone } from "@/lib/pulse/board";

import { HazeWords } from "./HazeWords";

const TONE_COLOR: Record<SpeechTone, string> = {
  danger: "var(--danger)",
  warn: "var(--warn)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

export type AssistantLine = { id: string; text: string; tone?: SpeechTone };

type Props = {
  /** The director's own words, when the assistant is answering a question. */
  said?: string | null;
  /** What the assistant says — one line for the moment, a few when it answers. */
  lines: AssistantLine[];
  children?: ReactNode;
};

/**
 * What the assistant says, under its face: one line for the moment, a few when it
 * answers a question. A new line comes out of a haze word by word, as a written answer
 * does (D-166), and is replaced by the next one — the balls and cards carry the state, the
 * line carries the moment.
 */
export function Assistant({ said, lines, children }: Props) {
  if (!said && lines.length === 0 && !children) return null;
  return (
    <div className="flex flex-col gap-2" aria-live="polite">
      {said ? (
        <div className="flex justify-end pt-1">
          <p className="max-w-[85%] rounded-[16px] rounded-tr-[6px] bg-surface-2 px-4 py-2 text-[16px] leading-[22px]">{said}</p>
        </div>
      ) : null}
      {lines.map((line) => (
        // keyed by id: a new line comes in word by word, the old one is gone
        <p key={line.id} className="relative py-1 pl-4 text-center text-[17px] leading-6" data-testid="assistant-line">
          {line.tone ? <span aria-hidden className="absolute left-0 top-[11px] h-2 w-2 rounded-full" style={{ background: TONE_COLOR[line.tone] }} /> : null}
          <HazeWords text={line.text} />
        </p>
      ))}
      {children}
    </div>
  );
}
