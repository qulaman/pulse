"use client";

import Link from "next/link";

import { useDeskPanel } from "@/components/desk/ui/DeskPanel";
import { Num } from "@/components/desk/ui/Num";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { rowMoves } from "@/lib/desk/tasks";
import type { BoardTask } from "@/lib/pulse/board";
import type { DeskAction } from "@/lib/tasks/desk";
import { BLIND_NUDGE_HINT } from "@/lib/tasks/reasons";

import { copyPhone } from "./RowMoves";
import type { StatusScreen } from "@/lib/tasks/overview";

/** The calm moment's quiet line on the desk: a new order is a line away, not the phone's voice (D-154). */
export const DESK_NEW_TASK = "Новую задачу — строкой сверху · Ctrl K";

/**
 * The move the verdict offers when nothing waits in «Ждут вас» but a task still needs the director
 * (lib/tasks/attention.ts, D-194): the moment names the cause and this is what to do with it.
 */
export type MomentAct = { label: string; title?: string; held?: boolean; onPress: () => void };

/**
 * The moment's move for its loudest task (`screen.focus`): «Напомнить» an order lying untaken — or
 * when the last reminder went —, else the task opened in the panel, where its receipt and its moves
 * are (a push that will not reach asks for a call: the panel says whose and since when). Null — all
 * is well, or the focus is a decision and «Разобрать по одной» leads to it.
 */
export function momentAct(
  screen: StatusScreen,
  task: BoardTask | undefined,
  now: Date,
  on: { press: (action: DeskAction, task: BoardTask) => void; open: (id: string) => void },
  tel: string | null = null,
): MomentAct | null {
  const verdict = screen.attention;
  if (!verdict || verdict.ok || !task || screen.focus !== task.id) return null;
  // a push will not reach: «Позвонить» with the number (no `tel:` on a computer, D-175); no number —
  // «Напомнить» saying that the push will not come (owner, 2026-11-25)
  if (verdict.action === "call") {
    if (tel) return { label: `Позвонить · ${tel}`, title: "Уведомления не доходят — клик скопирует номер", onPress: () => void copyPhone(tel) };
    const nudge = rowMoves(task, null, { nudgedAt: task.nudged_at }, now).find((move) => move.action === "nudge");
    if (nudge) return { label: nudge.label, title: BLIND_NUDGE_HINT, held: nudge.held, onPress: () => on.press("nudge", task) };
  }
  if (verdict.action === "nudge") {
    const nudge = rowMoves(task, null, { nudgedAt: task.nudged_at }, now).find((move) => move.action === "nudge");
    if (nudge) return { label: nudge.label, title: nudge.title ?? `Напомнить: «${task.title}»`, held: nudge.held, onPress: () => on.press("nudge", task) };
  }
  return { label: "Открыть задачу", title: `«${task.title}» — в панели`, onPress: () => on.open(task.id) };
}

/** A second number of the moment, as words that filter: «В работе 5». `active` — its filter is on. */
export type MomentCounter = { key: string; label: string; value: number; active?: boolean; onClick?: () => void; href?: string };

/**
 * «Момент» — the total above «Сегодня» and «Задачи», one line of the sheet (D-158): the figure in
 * the ink of the moment and its sentence, the second numbers as words that filter, the screen's
 * main button while something waits. The work starts right under it. On a narrow list (the panel
 * took the room, a window of 1100) it wraps by its own width: the figure, the sentence and the button first, the
 * counters on the next line. The screen has one filled button: with a panel open it is the panel's
 * closing move, and this one steps back to a word in the pen.
 */
export function MomentBar({
  screen,
  eyebrow,
  detail,
  counters,
  queue,
  enterKey = false,
  act = null,
}: {
  screen: StatusScreen;
  /** a person picked names the moment */
  eyebrow?: string;
  /** replaces the quiet line — the desk's own words for what the phone says */
  detail?: string;
  counters: readonly MomentCounter[];
  /** what waits in «Ждут вас»: «Разобрать по одной» stands while it is more than nothing */
  queue: number;
  /** Enter on this screen goes to «Ждут вас»: the button says so */
  enterKey?: boolean;
  /** with nothing in «Ждут вас», the verdict's own move (`momentAct`) */
  act?: MomentAct | null;
}) {
  const panel = useDeskPanel();
  const tone = TONE_VAR[screen.tone];
  const open = screen.segments.some((segment) => segment.count > 0);
  // nothing open: the line tells what got done instead of standing empty
  const line = detail ?? (screen.detail || (open ? "" : `закрыто сегодня ${screen.closedToday} · за 7 дней ${screen.closedWeek}`));

  return (
    <div className="@container">
      <section data-testid="desk-moment" data-tone={screen.tone} className="desk-total flex items-center gap-x-4 gap-y-1.5 @max-[900px]:flex-wrap">
        {screen.value !== null ? (
          <span className="nums desk-figure shrink-0 text-[44px] leading-[44px] @max-[900px]:text-[28px] @max-[900px]:leading-8" style={{ color: tone }} data-testid="desk-moment-value">
            {screen.value}
          </span>
        ) : (
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="square" className="h-9 w-9 shrink-0 @max-[900px]:h-7 @max-[900px]:w-7" style={{ color: tone }}>
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-semibold leading-[22px] @max-[900px]:text-[14px] @max-[900px]:leading-5" data-testid="desk-moment-label">
            {eyebrow ? <span className="desk-label mr-2 uppercase">{eyebrow}</span> : null}
            {screen.label}
          </p>
          <p className="truncate text-[13px] leading-[18px] text-muted" title={line}>
            {line || " "}
          </p>
        </div>
        {counters.length > 0 ? (
          <div className="flex items-center divide-x divide-border @max-[900px]:order-3 @max-[900px]:w-full @max-[900px]:flex-wrap" data-testid="desk-moment-counters">
            {counters.map((counter) => (
              <Counter key={counter.key} counter={counter} />
            ))}
          </div>
        ) : null}
        {queue > 0 ? (
          <Link
            href="/desk/inbox"
            prefetch
            data-testid="desk-inbox-entry"
            className={`${panel.isOpen ? "desk-move border" : "btn-primary"} inline-flex h-9 shrink-0 items-center gap-2 px-4 text-[14px] leading-4 @max-[900px]:order-2 @max-[900px]:h-8 @max-[900px]:px-3 @max-[900px]:text-[13px] @max-[480px]:order-4`}
          >
            <span>
              Разобрать<span className="@max-[900px]:hidden"> по одной</span>
            </span>
            <span aria-hidden>{enterKey ? "⏎" : "→"}</span>
          </Link>
        ) : act ? (
          <button
            type="button"
            onClick={act.onPress}
            disabled={act.held}
            title={act.title}
            data-testid="desk-moment-act"
            className={`${panel.isOpen || act.held ? "desk-move border" : "btn-primary"} inline-flex h-9 shrink-0 items-center gap-2 px-4 text-[14px] leading-4 disabled:opacity-60 @max-[900px]:order-2 @max-[900px]:h-8 @max-[900px]:px-3 @max-[900px]:text-[13px] @max-[480px]:order-4`}
          >
            {act.label}
          </button>
        ) : null}
      </section>
    </div>
  );
}

function Counter({ counter }: { counter: MomentCounter }) {
  const body = (
    <>
      <span className={counter.active ? "text-accent" : "text-muted"}>{counter.label}</span>
      <Num value={counter.value} className={counter.active ? "!text-accent" : counter.value ? "text-text" : ""} />
    </>
  );
  const className = `inline-flex h-6 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] leading-4 first:pl-0 last:pr-0 @max-[900px]:h-6 ${counter.active ? "font-semibold" : "hover:underline"}`;
  if (counter.href) {
    return (
      <Link href={counter.href} prefetch className={className} data-testid={`moment-${counter.key}`}>
        {body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={counter.onClick} aria-pressed={counter.active} className={className} data-testid={`moment-${counter.key}`}>
      {body}
    </button>
  );
}
