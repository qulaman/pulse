"use client";

import type { ReactNode } from "react";

import { passedWord, untilWords } from "@/lib/tasks/lifecycle";
import { spokenOf, TEXT } from "@/lib/tasks/status-text";
import { TONE_VAR, type Tone } from "@/lib/tasks/tone";

import { Icon } from "./icons";

/*
 * The notes a task wears inside its card, the same on every screen that shows one — the cards of
 * «Задачи» and «Мои дела», the task's own screen, the full card of Пульс and Лента — so a word or
 * a tint cannot drift between them.
 */

/** A tinted note inside a card: a refusal, a return, a recall. `className` adds to the box (a card with a rail wants `relative`). */
export function Note({ tone, icon, children, className = "" }: { tone: Tone; icon: ReactNode; children: ReactNode; className?: string }) {
  return (
    <p
      className={`mt-3 flex items-start gap-2 rounded-[12px] border px-3 py-2 text-[14px] leading-[19px] ${className}`}
      style={{
        color: TONE_VAR[tone],
        borderColor: `color-mix(in srgb, ${TONE_VAR[tone]} 32%, transparent)`,
        background: `color-mix(in srgb, ${TONE_VAR[tone]} 8%, transparent)`,
      }}
    >
      <span className="mt-[2px]">{icon}</span>
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** A recalled task: who took it over (D-128), or that it was taken back. */
export function RevokedNote({ task, className }: { task: { passed_to: string | null; passed?: { full_name: string } | null }; className?: string }) {
  return task.passed_to ? (
    <Note tone="muted" icon={<Icon name="swap" size={15} />} className={className}>
      {passedWord(task.passed?.full_name)}
    </Note>
  ) : (
    <Note tone="muted" icon={<Icon name="undo" size={15} />} className={className}>
      {TEXT.revoked}
    </Note>
  );
}

/** The employee's own request for another deadline, still waiting for the director (D-128). */
export function TimeRequestNote({ proposed, now, className }: { proposed: string; now: Date; className?: string }) {
  return (
    <Note tone="warn" icon={<Icon name="clock" size={15} />} className={className}>
      Просите срок {untilWords(proposed, now)} · ждёт ответа директора
    </Note>
  );
}

/**
 * «Что сказал директор» behind a tap: the recording's words, quoted. The whole row is the
 * finger's target (44 px, D-173), its words keep their size. Nothing for a typed order (`spokenOf`).
 */
export function TranscriptSpoiler({ task, className = "" }: { task: { title: string; source_transcript: string | null }; className?: string }) {
  if (!spokenOf(task)) return null;
  return (
    <details className={`group mt-1 ${className}`}>
      <summary className="-mx-1.5 flex min-h-[44px] cursor-pointer list-none items-center gap-1.5 rounded-[10px] px-1.5 text-[13px] leading-4 text-muted transition-colors duration-[120ms] active:bg-white/[0.04] [&::-webkit-details-marker]:hidden">
        <Icon name="quote" size={14} />
        {TEXT.transcriptSpoiler}
        <span aria-hidden className="ml-auto transition-transform duration-[120ms] group-open:rotate-180">
          ▾
        </span>
      </summary>
      <blockquote
        className="my-1 border-l-2 pl-3 text-[14px] italic leading-[19px] text-muted"
        style={{ borderColor: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
      >
        «{task.source_transcript}»
      </blockquote>
    </details>
  );
}
