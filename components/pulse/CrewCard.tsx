"use client";

import Link from "next/link";
import type { Ref } from "react";

import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { isLate, wordOf } from "@/lib/idle/look";
import type { Member, Seat } from "@/lib/idle/people";

/**
 * The card of a person at work (D-118, replaces the read-only star card of D-73 §3): who he is
 * and what he is on, each task a tap away from its own screen — with the same stage mark the
 * task has on «Задачи», so the circle, the card and the screen speak one language. A refusal
 * says why, a question is quoted, an unread word is flagged. «Все дела» opens his card.
 *
 * It stands next to him — under him when he is high up, above him when not — and never runs
 * off the screen. `reach` — how far out of his seat the card starts (his ring and a gap).
 */
export function CrewCard({
  ref,
  member,
  seat,
  box,
  reach,
  allHref,
  onClose,
}: {
  ref?: Ref<HTMLDivElement>;
  member: Member;
  seat: Seat;
  /** the play area the card has to stay inside, px */
  box: { w: number; h: number };
  reach: number;
  /** where «Все дела» goes — his card on «Команда» (a sandbox points it elsewhere) */
  allHref?: string;
  onClose: () => void;
}) {
  const width = Math.min(box.w - 24, 304);
  const left = Math.max(-box.w / 2 + 12, Math.min(box.w / 2 - 12 - width, seat.x - width / 2));
  const below = seat.y < -box.h / 6;
  const tasks = member.tasks.filter((t) => t.status !== "done");
  const shown = tasks.slice(0, 3);
  const rest = tasks.length - shown.length;
  const count = tasks.length;
  return (
    <div
      ref={ref}
      className="pointer-events-auto absolute left-1/2 top-1/2 z-30"
      style={{ width, transform: below ? `translate(${left}px, ${seat.y + reach}px)` : `translate(${left}px, calc(${seat.y - reach}px - 100%))` }}
    >
      <div
        className="rounded-[20px] border border-border bg-surface p-3"
        style={{ boxShadow: "var(--shadow-raised)", animation: "crew-card 220ms var(--ease-out) both", transformOrigin: below ? "50% 0" : "50% 100%" }}
        data-testid="crew-card"
      >
        <div className="flex items-center gap-2 pl-1">
          <p className="min-w-0 truncate font-display text-[17px] font-semibold leading-6">{member.fullName}</p>
          <button
            type="button"
            aria-label="Закрыть"
            onClick={onClose}
            className="-my-1 -mr-1 ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[18px] text-muted"
          >
            ×
          </button>
        </div>
        <p className="pl-1 text-[13px] leading-4 text-muted">
          {count} {count % 10 === 1 && count % 100 !== 11 ? "задача" : count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14) ? "задачи" : "задач"}
        </p>
        <ul className="mt-1.5 flex flex-col">
          {shown.map((task) => (
            <li key={task.id}>
              <Link href={task.href} className="flex items-start gap-2.5 rounded-[14px] px-1 py-2 active:bg-surface-2" data-testid="crew-task">
                <span className="pt-px">
                  <StatusGlyph status={task.status} overdue={isLate(task)} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] leading-5">{task.title}</span>
                  <span className="block text-[12px] leading-4" style={{ color: task.status === "declined" || isLate(task) ? "var(--danger)" : "var(--text-muted)" }}>
                    {wordOf(task)}
                  </span>
                  {task.question ? (
                    <span className="mt-0.5 block truncate text-[12px] leading-4 text-warn">вопрос: «{task.question}»</span>
                  ) : task.unread ? (
                    <span className="mt-0.5 block text-[12px] leading-4 text-accent">новое сообщение</span>
                  ) : null}
                </span>
                <span aria-hidden className="pt-0.5 text-[18px] leading-5 text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-0.5 flex items-center justify-between px-1">
          <span className="text-[12px] leading-4 text-muted">{rest > 0 ? `и ещё ${rest}` : ""}</span>
          <Link href={allHref ?? `/people/${member.id}`} className="text-[13px] font-semibold leading-5 text-accent" data-testid="crew-all">
            Все дела ›
          </Link>
        </div>
      </div>
    </div>
  );
}
