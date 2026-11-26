"use client";

import { ChevronDown } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";

import { Face } from "@/components/desk/ui/Face";
import { useRemindDailyReport } from "@/lib/daily-report/actions";
import { pointsText, shortHm, timeOf } from "@/lib/daily-report/format";
import type { DailyReportReminder, TeamDay, TeamDayRow } from "@/lib/daily-report/types";
import { nowHm } from "@/lib/datetime/calendar";
import { useCompanySettings } from "@/lib/dictionary-queries";


/** The company's delivery window (`settings.delivery_window`, principle 8): a push queued outside it waits. */
export type Window = { from: string; to: string };
const DEFAULT_WINDOW: Window = { from: "08:00", to: "21:00" };

export function beforeWindow(now: Date, window: Window = DEFAULT_WINDOW): boolean {
  return nowHm(now) < window.from;
}

/** Past the window's end: a push now would come tomorrow, about a day that is over — the server refuses it (`late`). */
export function afterWindow(now: Date, window: Window = DEFAULT_WINDOW): boolean {
  return nowHm(now) >= window.to;
}

/** «напомнил 17:32 · увидел» / «· не открывал» / «авто 18:00 · уйдёт в 8:00» — principle 8, never «не получил». */
export function receiptText(reminder: DailyReportReminder, now: Date, window: Window = DEFAULT_WINDOW): string {
  const who = reminder.by === "director" ? `напомнил ${timeOf(reminder.at)}` : `авто ${timeOf(reminder.at)}`;
  const state = reminder.seen_at ? "увидел" : reminder.sent_at ? "не открывал" : beforeWindow(now, window) ? `уйдёт в ${shortHm(window.from)}` : "в очереди";
  return `${who} · ${state}`;
}

/** The day's people counted as the roll call says them; who owed nothing is left out. */
export type RollCount = {
  submitted: number;
  /** Who owed the report: handed in, waited for, missed (the excused among them). */
  due: number;
  pending: number;
  missed: number;
  excused: number;
  away: { vacation: number; sick: number; either: number };
};

const isExcused = (row: TeamDayRow) => Boolean(row.report?.excused_at);

export function rollCount(rows: readonly TeamDayRow[], live: boolean): RollCount {
  // the day's counts are the team's now (D-194): a row of who left is history, not a miss of today
  const of = (state: TeamDayRow["state"]) => rows.filter((row) => row.state === state && !row.gone);
  const missed = of("missed");
  const away = of("away");
  const submitted = of("submitted").length;
  const pending = of("pending").length;
  const vacation = live ? away.filter((row) => row.availability === "vacation").length : 0;
  const sick = live ? away.filter((row) => row.availability === "sick").length : 0;
  return {
    submitted,
    due: submitted + pending + missed.length,
    pending,
    missed: missed.length,
    excused: missed.filter(isExcused).length,
    away: { vacation, sick, either: away.length - vacation - sick },
  };
}

/** «ждём 3 · не сдали 1 · в отпуске 2» — the rest of the strip's line after «8 из 11 сдали». */
export function rollRest(count: RollCount): string[] {
  return [
    count.pending ? `ждём ${count.pending}` : "",
    count.missed - count.excused ? `не сдали ${count.missed - count.excused}` : "",
    count.excused ? `уважительная ${count.excused}` : "",
    count.away.vacation ? `в отпуске ${count.away.vacation}` : "",
    count.away.sick ? `на больничном ${count.away.sick}` : "",
    count.away.either ? `отпуск или больничный ${count.away.either}` : "",
  ].filter(Boolean);
}

/** A double click on a control inside a row stays the control's. */
const fromControl = (event: MouseEvent) => (event.target as HTMLElement).closest("button, a, input, textarea") !== null;

type RowProps = {
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
};

const ROW_MOVE = { type: "tween", duration: 0.23, ease: [0.2, 0.8, 0.2, 1] } as const;

function Person({ row, note, end, select }: { row: TeamDayRow; note?: ReactNode; end?: ReactNode; select: RowProps }) {
  const selected = select.selectedId === row.user_id;
  return (
    <motion.li
      layout="position"
      transition={ROW_MOVE}
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: 0.14, ease: "easeIn" } }}
      className="rep-day-person"
      data-row-key={row.user_id}
      data-selected={selected ? "" : undefined}
      data-open={select.openId === row.user_id ? "" : undefined}
      aria-current={selected ? "true" : undefined}
      onClick={() => select.onSelect(row.user_id)}
      onDoubleClick={(event) => {
        if (!fromControl(event)) select.onOpen(row.user_id);
      }}
    >
      <Face person={{ id: row.user_id, full_name: row.full_name, avatar_url: row.avatar_url }} size={24} />
      <span className="min-w-0 flex-1">
        <span className="rep-day-person-name" title={row.position ? `${row.full_name} · ${row.position}` : row.full_name}>
          {row.full_name}
        </span>
        {note ? <span className="rep-day-person-note">{note}</span> : null}
      </span>
      {end}
    </motion.li>
  );
}

function Group({ kind, title, count, children }: { kind: "pending" | "missed" | "away"; title: string; count: number; children: ReactNode }) {
  return (
    <section className="rep-day-group" data-kind={kind} aria-label={title}>
      <div className="rep-day-group-head">
        <span className="rep-day-dot" aria-hidden />
        <h3 className="rep-day-group-title">
          {title} <span className="nums rep-day-group-count">· {count}</span>
        </h3>
      </div>
      <ul className="rep-day-people">
        {/* one who handed in leaves «Ждём», the rest close up; the last one takes the section along (D-184) */}
        <AnimatePresence initial={false}>{children}</AnimatePresence>
      </ul>
    </section>
  );
}

/** One thin bar of who owed the report: handed in, missed, excused, the rest still to come. */
function ShareLine({ count }: { count: RollCount }) {
  if (count.due === 0) return null;
  const parts = [
    { key: "ok", value: count.submitted },
    { key: "missed", value: count.missed - count.excused },
    { key: "excused", value: count.excused },
  ].filter((part) => part.value > 0);
  const label = [`сдали ${count.submitted} из ${count.due}`, ...rollRest({ ...count, away: { vacation: 0, sick: 0, either: 0 } })].join(", ");
  return (
    <span className="rep-day-share" role="img" aria-label={label}>
      {parts.map((part) => (
        <i key={part.key} data-tone={part.key} style={{ "--w": `${(part.value / count.due) * 100}%` } as CSSProperties} />
      ))}
    </span>
  );
}

/**
 * The roll call of a day (D-183; inside today's section of the feed — D-201): one line — how many of
 * those who owed the report handed it in, one thin bar, «Напомнить всем» — that opens in place: who
 * we still wait for, with «Напомнить» each and the receipt of the push; who missed it (the minus,
 * small, for the director only; an excused day grey); who is away. Nobody who owed nothing is listed.
 */
export function RollCall({
  day,
  rows,
  expanded,
  onExpand,
  live,
  offWord,
  pointsOn,
  now,
  selectedId,
  openId,
  onSelect,
  onOpen,
}: {
  day: TeamDay;
  /** The day's people the search lets through. */
  rows: readonly TeamDayRow[];
  expanded: boolean;
  onExpand: (open: boolean) => void;
  /** Away is today's availability: today, or a day the morning tick has not closed yet. */
  live: boolean;
  /** «выходной» / «праздник» — nothing was due; null on a working day. */
  offWord: "выходной" | "праздник" | null;
  pointsOn: boolean;
  now: Date;
} & RowProps) {
  const remind = useRemindDailyReport();
  const settings = useCompanySettings();
  const [sending, setSending] = useState<ReadonlySet<string>>(() => new Set());
  // reminded from here, the day's rows not back yet: no second button meanwhile (the hook says it in a toast)
  const [sent, setSent] = useState<ReadonlySet<string>>(() => new Set());
  const select: RowProps = { selectedId, openId, onSelect, onOpen };

  const count = rollCount(day.rows, live);
  const pending = rows.filter((row) => row.state === "pending");
  const missed = rows.filter((row) => row.state === "missed");
  const away = rows.filter((row) => row.state === "away");

  const askable = (row: TeamDayRow) => !row.reminded && !sent.has(row.user_id);
  const waiting = pending.filter((row) => askable(row) && !sending.has(row.user_id));
  const send = (ids: string[]) => {
    if (ids.length === 0) return;
    setSending((prev) => new Set([...prev, ...ids]));
    remind.mutate(
      { userIds: ids },
      {
        onSuccess: (result) => setSent((prev) => new Set([...prev, ...result.reminded])),
        onSettled: () =>
          setSending((prev) => {
            const next = new Set(prev);
            for (const id of ids) next.delete(id);
            return next;
          }),
      },
    );
  };
  const window = settings.data?.delivery_window ?? DEFAULT_WINDOW;
  const early = beforeWindow(now, window);
  const late = afterWindow(now, window);
  const remindAll =
    waiting.length > 0 ? (
      <button
        type="button"
        className="rep-day-remind desk-focus"
        data-testid="desk-remind-all"
        title={
          late
            ? "Уже тихие часы — напоминание дошло бы завтра, не шлю"
            : early
              ? `Пуши уйдут в ${shortHm(window.from)} — ночью не будим`
              : "Один пуш каждому, кто ещё не сдал"
        }
        onClick={() => send(waiting.map((row) => row.user_id))}
      >
        {waiting.length > 1 ? `Напомнить всем (${waiting.length})` : "Напомнить (1)"}
      </button>
    ) : null;

  const awayGroups = live
    ? [
        { key: "vacation", title: "В отпуске", rows: away.filter((row) => row.availability === "vacation") },
        { key: "sick", title: "На больничном", rows: away.filter((row) => row.availability === "sick") },
        { key: "either", title: "Отпуск или больничный", rows: away.filter((row) => row.availability === "active") },
      ]
    : [{ key: "either", title: "Отпуск или больничный", rows: away }];

  const groups = (
    <>
      {pending.length > 0 ? (
        <Group kind="pending" title="Ждём" count={pending.length}>
          {pending.map((row) => {
            const reminder = row.reminded;
            const busy = sending.has(row.user_id);
            return (
              <Person
                key={row.user_id}
                row={row}
                select={select}
                note={reminder ? <span title={reminder.seen_at ? `Увидел в ${timeOf(reminder.seen_at)}` : undefined}>{receiptText(reminder, now, window)}</span> : null}
                end={
                  askable(row) ? (
                    <button
                      type="button"
                      className="rep-day-remind desk-focus"
                      data-testid="desk-remind"
                      disabled={busy}
                      aria-busy={busy || undefined}
                      title={late ? "Уже тихие часы — напоминание дошло бы завтра, не шлю" : early ? `Пуш уйдёт в ${shortHm(window.from)} — ночью не будим` : "Один пуш: «Директор ждёт отчёт за день»"}
                      onClick={() => send([row.user_id])}
                    >
                      Напомнить
                    </button>
                  ) : null
                }
              />
            );
          })}
        </Group>
      ) : null}
      {missed.length > 0 ? (
        <Group kind="missed" title="Не сдали" count={missed.length}>
          {missed.map((row) => {
            const excused = isExcused(row);
            const points = row.report?.points ?? 0;
            return (
              <Person
                key={row.user_id}
                row={row}
                select={select}
                end={
                  excused ? (
                    <span className="rep-day-excused" title={row.report?.excused_reason ? `Уважительная: ${row.report.excused_reason}` : undefined}>
                      уважительная
                    </span>
                  ) : pointsOn && points < 0 ? (
                    <span className="nums rep-day-minus">{pointsText(points)}</span>
                  ) : null
                }
              />
            );
          })}
        </Group>
      ) : null}
      {awayGroups
        .filter((group) => group.rows.length > 0)
        .map((group) => (
          <Group key={group.key} kind="away" title={group.title} count={group.rows.length}>
            {group.rows.map((row) => (
              <Person key={row.user_id} row={row} select={select} />
            ))}
          </Group>
        ))}
    </>
  );
  const listed = pending.length + missed.length + away.length > 0;

  const figure =
    offWord !== null ? (
      count.submitted > 0 ? (
        <>
          <span className="nums rep-day-roll-figure">{count.submitted}</span> сдали в {offWord === "праздник" ? "праздник" : "выходной"}
        </>
      ) : (
        <>{offWord === "праздник" ? "Праздник" : "Выходной"} — отчёт по желанию</>
      )
    ) : count.due === 0 ? (
      <>Никто не должен был сдавать</>
    ) : (
      <>
        <span className="nums rep-day-roll-figure">{count.submitted}</span> из <span className="nums">{count.due}</span> сдали
      </>
    );
  // a day off with nothing handed in and nobody to list: the line above the ledger says it all
  if (offWord !== null && count.submitted === 0 && !listed) return null;
  const rest = offWord === null ? rollRest(count) : [];
  return (
    <section className="rep-day-roll" data-mode="strip" data-open={expanded ? "" : undefined} data-testid="desk-rollcall" aria-label="Перекличка">
      <div className="rep-day-strip">
        <button type="button" className="rep-day-strip-toggle desk-focus" aria-expanded={listed ? expanded : undefined} disabled={!listed} onClick={() => onExpand(!expanded)}>
          <span className="rep-day-strip-count" data-testid="desk-rollcall-count">
            {figure}
          </span>
          {rest.length > 0 ? <span className="rep-day-strip-rest">· {rest.join(" · ")}</span> : null}
          {listed ? <ChevronDown size={15} strokeWidth={2.25} className="rep-day-strip-chevron" aria-hidden /> : null}
        </button>
        {offWord === null ? <ShareLine count={count} /> : null}
        {remindAll}
      </div>
      {expanded && listed ? <div className="rep-day-roll-body">{groups}</div> : null}
    </section>
  );
}

