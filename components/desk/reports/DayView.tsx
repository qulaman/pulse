"use client";

import { ArrowRight, ClipboardCheck, ListChecks, MessageSquare, Send } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

import { DataGrid, type Column, type Group } from "@/components/desk/ui/DataGrid";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { Num } from "@/components/desk/ui/Num";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { When } from "@/components/desk/ui/When";
import { Icon } from "@/components/tasks/desk/icons";
import { StatusGlyph } from "@/components/tasks/list/StatusGlyph";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { addDaysYmd, dayTitle, durationText, hoursText, personDayLine, pointsText, STATE_TITLE, taskMeta, timeOf } from "@/lib/daily-report/format";
import type { TeamDay, TeamDayRow, TeamDayState } from "@/lib/daily-report/types";
import type { Ymd } from "@/lib/datetime/calendar";
import { pointsTone } from "@/lib/desk/format";

import { TileFace } from "../team/TeamGrid";
import { useBoxWidth } from "../team/shared";
import { AxisHead, axisOf, minutesOf, ReportsHero, ReportsHeroBone, ShareBar, TimeBar, Who, type Axis, type HeroNote, type SharePart } from "./parts";

/** Below this width of the table the column steps aside — the words first (the panel says them whole), then the day's bars. */
const ROOM: Partial<Record<string, number>> = { summary: 940, day: 600, hours: 520 };

/** Who the director reads first on the desk: those who owe the report, then the rest (D-154). */
const DESK_ORDER: TeamDayState[] = ["missed", "pending", "submitted", "away", "off"];
const GROUP_TONE: Record<TeamDayState, Tone> = { missed: "danger", pending: "muted", submitted: "ok", away: "muted", off: "muted" };

/** Which of the day's people the table shows — the screen's filter, set by the legend too. */
export type DayShow = "all" | "owe" | "in";

/** The first line of «Что сделано» — the row's words; the rest is in the panel. */
function firstLine(text: string | null | undefined): string {
  return (text ?? "").split(/\n/).find((line) => line.trim())?.trim() ?? "";
}

/** A person's day in a word that has no gender: «ещё не сдан», «отчёт не сдан», «в отпуске». */
function dayWord(row: TeamDayRow): string {
  return row.state === "pending" ? "ещё не сдан" : personDayLine(row);
}

/** «9:05» of minutes of the day. */
function clock(minutes: number): string {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function average(values: readonly (number | null)[]): number | null {
  const known = values.filter((value): value is number => value !== null);
  return known.length ? Math.round(known.reduce((sum, value) => sum + value, 0) / known.length) : null;
}

const handedIn = (row: TeamDayRow) => (row.report?.status === "submitted" ? row.report : null);

/** A step back or forth: a chevron on the sheet, no box. */
export const STEP =
  "reports-step flex h-8 w-8 items-center justify-center rounded-[8px] text-muted hover:bg-surface-2 hover:text-text disabled:pointer-events-none disabled:opacity-35";

/** ‹ Вторник, 3 ноября › — the day; tomorrow is not a day yet; ← and → step too. */
export function DayStepper({ date, today, onDate }: { date: Ymd; today: Ymd; onDate: (date: Ymd) => void }) {
  const isToday = date === today;
  return (
    <div className="reports-stepper flex items-center gap-1" data-testid="desk-day-stepper">
      <button type="button" className={STEP} aria-label="Предыдущий день" title="Предыдущий день (←)" onClick={() => onDate(addDaysYmd(date, -1))}>
        <Icon name="left" size={16} />
      </button>
      <span key={date} className="reports-stepper-title min-w-[176px] text-center text-[14px] font-semibold leading-5" data-testid="desk-day-title">
        {dayTitle(date)}
      </span>
      <button type="button" className={STEP} aria-label="Следующий день" title="Следующий день (→)" disabled={isToday} onClick={() => onDate(addDaysYmd(date, 1))}>
        <Icon name="right" size={16} />
      </button>
      {isToday ? (
        <span className="ml-1 w-[76px] text-right text-[13px] leading-4 text-muted">сегодня</span>
      ) : (
        <Tooltip label="К сегодня" keys={["T"]}>
          <Button size="sm" variant="ghost" className="ml-1 !min-h-8 w-[76px] !justify-end !px-0" onClick={() => onDate(today)}>
            К сегодня
          </Button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * The total of a day (D-174): how many handed the report in, large; when people came and went on
 * average and how much work moved; under it the team as one thin bar — handed in, still to come,
 * missed, away — whose legend narrows the table to those people.
 */
function DayHero({ day, show, onShow }: { day: TeamDay; show: DayShow; onShow: (show: DayShow) => void }) {
  const t = day.totals;
  const away = t.away > 0 ? `${t.away} в отпуске и на больничном` : null;
  const when = !day.workday ? "не рабочий день — отчёт по желанию, без очков" : day.today ? (t.pending > 0 ? "сегодня — день ещё идёт" : "сегодня") : "итог дня";
  const reports = day.rows.map(handedIn).filter((report) => report !== null);
  const came = average(reports.map((report) => minutesOf(report.arrived_at)));
  const went = average(reports.map((report) => minutesOf(report.left_at)));
  const toggle = (next: DayShow) => () => onShow(show === next ? "all" : next);
  const notes: HeroNote[] = [
    ...(came !== null ? [{ key: "arrived", label: "Приход, в среднем", value: clock(came) }] : []),
    ...(went !== null ? [{ key: "left", label: "Уход, в среднем", value: clock(went) }] : []),
    { key: "handed", label: "Сдано задач", value: <Num value={t.handed_over} /> },
    { key: "closed", label: "Принято", value: <Num value={t.closed} /> },
  ];
  const parts: SharePart[] = [
    { key: "in", value: t.submitted, label: "сдали", tone: "ok", onClick: toggle("in"), active: show === "in", title: "Показать тех, кто сдал" },
    { key: "pending", value: t.pending, label: "ещё не сдали", tone: "pending", onClick: toggle("owe"), active: show === "owe", title: "Показать тех, кто без отчёта" },
    { key: "missed", value: t.missed, label: "не сдали", tone: "danger", onClick: toggle("owe"), active: show === "owe", title: "Показать тех, кто без отчёта" },
    { key: "away", value: t.away, label: "не на месте", tone: "quiet" },
  ];
  return (
    <ReportsHero
      testId="desk-day-hero"
      figure={{ value: t.submitted }}
      title={day.workday ? `из ${t.team} сдали отчёт` : "сдали в выходной"}
      sub={[when, away].filter(Boolean).join(" · ")}
      notes={notes}
    >
      <ShareBar parts={parts} label={`Сдали ${t.submitted}, ещё не сдали ${t.pending}, не сдали ${t.missed}, не на месте ${t.away}`} />
    </ReportsHero>
  );
}

/** What stands in «Что сделано» for a person without words: the state, quietly. */
function Summary({ row }: { row: TeamDayRow }) {
  const line = handedIn(row) ? firstLine(row.report?.summary) : "";
  if (line) {
    return (
      <span className="block truncate text-muted" title={row.report?.summary ?? undefined}>
        {line}
      </span>
    );
  }
  if (row.state === "missed") {
    return (
      <span className="block truncate" style={{ color: TONE_VAR.danger }}>
        {dayWord(row)}
      </span>
    );
  }
  return <span className="block truncate text-muted/60">{dayWord(row)}</span>;
}

/** A time of the report, or a quiet dash. */
function At({ iso }: { iso: string | null | undefined }) {
  const text = timeOf(iso);
  return text ? <When>{text}</When> : <span className="text-muted/40">—</span>;
}

/** A small figure of the panel: what moved in the tasks that day. */
function Moved({ icon, value, label }: { icon: ReactNode; value: number; label: string }) {
  return (
    <div className="reports-moved" data-quiet={value === 0 ? "" : undefined}>
      <span className="reports-moved-icon" aria-hidden>
        {icon}
      </span>
      <span className="nums reports-moved-value">{value}</span>
      <span className="reports-moved-label">{label}</span>
    </div>
  );
}

/**
 * One person's report in the right-hand panel, read as a document (D-174): the face and the day,
 * the state in words, the working day as a bar on the clock with its times, the person's own words
 * at reading size, the day's tasks, what moved in the tasks, the way to the card.
 */
function ReportPanel({ row, date, now }: { row: TeamDayRow; date: Ymd; now: number | null }) {
  const report = handedIn(row);
  const from = minutesOf(report?.arrived_at);
  const to = minutesOf(report?.left_at);
  const axis: Axis = axisOf([{ from, to }], [7 * 60, 21 * 60]);
  const length = report ? (durationText(report.arrived_at, report.left_at) ?? (hoursText(row.hours) || null)) : null;
  const points = row.report ? pointsText(row.report.points) : "";
  const state =
    row.state === "submitted"
      ? `Отчёт сдан в ${timeOf(report?.submitted_at)}`
      : row.state === "pending"
        ? "Отчёт ещё не сдан"
        : row.state === "missed"
          ? "Отчёт не сдан"
          : personDayLine(row).replace(/^./, (c) => c.toUpperCase());
  const a = row.activity;
  return (
    <article className="reports-doc flex flex-col gap-5 pr-8" data-testid="desk-report-panel">
      <header className="flex items-center gap-3.5">
        <TileFace person={{ id: row.user_id, full_name: row.full_name, avatar_url: row.avatar_url }} size={52} />
        <div className="min-w-0">
          <p className="reports-doc-name truncate">{row.full_name}</p>
          <p className="truncate text-[13px] leading-[18px] text-muted">{[row.position, dayTitle(date)].filter(Boolean).join(" · ")}</p>
        </div>
      </header>

      <p className="reports-doc-state" data-tone={GROUP_TONE[row.state]}>
        <span className="reports-swatch" data-tone={row.state === "submitted" ? "ok" : row.state === "missed" ? "danger" : row.state === "pending" ? "pending" : "quiet"} aria-hidden />
        {state}
        {points ? (
          <span className="reports-doc-points nums" style={{ color: TONE_VAR[pointsTone(row.report?.points ?? 0)] }}>
            {points}
          </span>
        ) : null}
      </p>

      {report ? (
        <section className="reports-doc-day" aria-label="Рабочий день">
          <dl className="reports-doc-times">
            <div>
              <dt>Приход</dt>
              <dd className="nums">{timeOf(report.arrived_at) || "—"}</dd>
            </div>
            <div>
              <dt>Уход</dt>
              <dd className="nums">{timeOf(report.left_at) || "—"}</dd>
            </div>
            <div>
              <dt>На работе</dt>
              <dd className="nums">{length ?? "—"}</dd>
            </div>
          </dl>
          <TimeBar axis={axis} from={from} to={to} now={now} size="doc" label={from !== null && to !== null ? `С ${clock(from)} до ${clock(to)}` : "Время не указано"} />
          <AxisHead axis={axis} />
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="reports-doc-label">Что сделано за день</h3>
        {report?.summary ? (
          <p className="reports-doc-text">{report.summary}</p>
        ) : (
          <p className="text-[14px] leading-5 text-muted">{row.state === "pending" ? "Отчёт ещё не сдан" : dayWord(row)}</p>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="reports-doc-label">
          Задачи дня{row.tasks.length > 0 ? <span className="nums ml-1.5 text-muted">{row.tasks.length}</span> : null}
        </h3>
        {row.tasks.length === 0 ? (
          <p className="text-[14px] leading-5 text-muted">Сданных и принятых нет</p>
        ) : (
          <ul className="reports-doc-tasks">
            {row.tasks.map((task) => (
              <li key={task.id}>
                <Link href={`/desk/tasks?id=${task.id}`} className="reports-doc-task" title={taskMeta(task)}>
                  <StatusGlyph status={task.status} size={16} />
                  <span className="min-w-0 flex-1 truncate text-[14px] leading-5">{task.title}</span>
                  <span className="max-w-[45%] shrink-0 truncate text-[12px] leading-4 text-muted">{taskMeta(task)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="reports-doc-label">В задачах за день</h3>
        <div className="reports-moved-grid">
          <Moved icon={<ListChecks size={14} strokeWidth={2.25} />} value={a.accepted} label="взято в работу" />
          <Moved icon={<Send size={14} strokeWidth={2.25} />} value={a.handed_over} label="сдано" />
          <Moved icon={<ClipboardCheck size={14} strokeWidth={2.25} />} value={a.closed} label="принято" />
          <Moved icon={<MessageSquare size={14} strokeWidth={2.25} />} value={a.messages} label="сообщений" />
        </div>
      </section>

      <Link href={`/desk/team/${row.user_id}`} className="reports-doc-link">
        Карточка сотрудника
        <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
      </Link>
    </article>
  );
}

/** The day while it loads: the hero's height and the rows', nothing jumps when they land. */
function DayBone() {
  return (
    <>
      <ReportsHeroBone />
      <SkeletonGroup grow className="reports-bone-rows">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex h-[48px] items-center gap-5 px-3">
            <Bone round w={28} h={28} />
            <Bone h={14} w="18%" />
            <Bone h={6} w="22%" />
            <Bone h={14} w="8%" />
            <Bone h={14} w="30%" />
          </div>
        ))}
      </SkeletonGroup>
    </>
  );
}

export function LoadFailed({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      title="Не получилось загрузить отчёты"
      hint="Проверьте связь и попробуйте ещё раз"
      action={
        onRetry ? (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            Повторить
          </Button>
        ) : null
      }
    />
  );
}

/**
 * «Отчёты → День» on the desk (D-152, D-154, D-158, D-174): the total — how many handed the report
 * in, the team as one bar of parts whose legend filters; the people as one table — a face and a
 * name, the working day as a bar on one clock between its arrival and leaving, the hours, the
 * tasks, the first line of their words — those who owe the report first; a row opens the whole
 * report in the right-hand panel (`?p=`).
 */
export function DayView({
  day,
  stale,
  failed,
  onRetry,
  filter,
  filters,
  narrowed,
  onClear,
  show,
  onShow,
  selectedId,
  openId,
  onSelect,
  onOpen,
  onClose,
  pointsOn,
  now,
}: {
  day: TeamDay | undefined;
  stale: boolean;
  failed: boolean;
  onRetry: () => void;
  /** Who of the day's people the filters above let through. */
  filter: (row: TeamDayRow) => boolean;
  /** The people's filters over the table (who, the words). */
  filters: ReactNode;
  narrowed: boolean;
  onClear: () => void;
  show: DayShow;
  onShow: (show: DayShow) => void;
  selectedId: string | null;
  openId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  onClose: () => void;
  pointsOn: boolean;
  now: Date;
}) {
  const [box, width] = useBoxWidth();
  if (!day) return failed ? <LoadFailed onRetry={onRetry} /> : <DayBone />;

  const shown = day.rows.filter(filter);
  const groups: Group<TeamDayRow>[] = DESK_ORDER.map((state) => ({
    key: state,
    title: STATE_TITLE[state],
    tone: GROUP_TONE[state],
    rows: shown.filter((row) => row.state === state),
  }));
  const open = openId ? (day.rows.find((row) => row.user_id === openId) ?? null) : null;
  // one clock for every row: the earliest arrival to the latest leaving, whole hours
  const axis = axisOf(day.rows.map((row) => ({ from: minutesOf(handedIn(row)?.arrived_at), to: minutesOf(handedIn(row)?.left_at) })));
  const nowAt = day.today ? minutesOf(now.toISOString()) : null;
  const order = new Map(shown.map((row, index) => [row.user_id, index]));

  const columns: Column<TeamDayRow>[] = [
    {
      key: "who",
      title: "Кто",
      width: "minmax(180px,1.2fr)",
      sort: (a, b) => a.full_name.localeCompare(b.full_name, "ru"),
      render: (row) => <Who id={row.user_id} name={row.full_name} avatar={row.avatar_url} sub={row.position} quiet={row.state === "away" || row.state === "off"} />,
    },
    {
      key: "arrived",
      title: "Приход",
      width: "64px",
      align: "right",
      sort: (a, b) => (handedIn(a)?.arrived_at ?? "~").localeCompare(handedIn(b)?.arrived_at ?? "~"),
      render: (row) => <At iso={handedIn(row)?.arrived_at} />,
    },
    {
      key: "day",
      title: <AxisHead axis={axis} now={nowAt} />,
      width: "minmax(140px,1.4fr)",
      render: (row) => (
        <TimeBar axis={axis} from={minutesOf(handedIn(row)?.arrived_at)} to={minutesOf(handedIn(row)?.left_at)} now={nowAt} index={order.get(row.user_id) ?? 0} stamp={day.date} />
      ),
    },
    {
      key: "left",
      title: "Уход",
      width: "64px",
      sort: (a, b) => (handedIn(a)?.left_at ?? "").localeCompare(handedIn(b)?.left_at ?? ""),
      render: (row) => <At iso={handedIn(row)?.left_at} />,
    },
    {
      key: "hours",
      title: "Часы",
      width: "76px",
      align: "right",
      sort: (a, b) => (a.hours ?? -1) - (b.hours ?? -1),
      // hours come with a handed-in report only
      render: (row) => (row.hours === null || !handedIn(row) ? <span className="text-muted/40">—</span> : <span className="nums whitespace-nowrap">{hoursText(row.hours)}</span>),
    },
    {
      key: "tasks",
      title: "Задачи",
      width: "72px",
      align: "right",
      sort: (a, b) => a.tasks.length - b.tasks.length,
      render: (row) => <Num value={row.tasks.length} />,
    },
    // the words give way first when the panel narrows the screen
    { key: "summary", title: "Что сделано", width: "minmax(0,1.3fr)", render: (row) => <Summary row={row} /> },
  ];
  if (pointsOn) {
    columns.push({
      key: "points",
      title: "Очки",
      width: "64px",
      align: "right",
      sort: (a, b) => (a.report?.points ?? 0) - (b.report?.points ?? 0),
      render: (row) => (row.report ? <Num value={row.report.points} signed tone={pointsTone(row.report.points)} /> : <span className="text-muted/40">—</span>),
    });
  }

  return (
    <div className="reports-view flex flex-col gap-3.5" data-stale={stale ? "" : undefined} aria-busy={stale || undefined} data-testid="desk-reports-day">
      <DayHero day={day} show={show} onShow={onShow} />
      {filters}
      <div ref={box} className="reports-table">
        <DataGrid
          aria-label="Отчёты за день"
          columns={columns.filter((column) => width === 0 || width >= (ROOM[column.key] ?? 0))}
          groups={groups}
          rowKey={(row) => row.user_id}
          selectedKey={selectedId}
          onSelect={(row) => onSelect(row.user_id)}
          onActivate={(row) => onOpen(row.user_id)}
          onRowClick={(row) => onOpen(row.user_id)}
          empty={
            narrowed ? (
              <EmptyState
                title="Никого не нашлось"
                hint="Поиск — по имени и должности; «Без отчёта» и «Сдали» — над таблицей"
                action={
                  <Button size="sm" variant="secondary" onClick={onClear}>
                    Показать всех
                  </Button>
                }
              />
            ) : (
              <EmptyState title="В команде пока никого" hint="Отчёты сдают сотрудники — появятся, когда в команде будут люди" />
            )
          }
        />
      </div>
      {openId ? (
        <InPanel panelKey={`report:${openId}`} onClose={onClose}>
          {open ? <ReportPanel row={open} date={day.date} now={nowAt} /> : <p className="pr-8 text-[14px] leading-5 text-muted">Этого человека нет в отчётах за этот день.</p>}
        </InPanel>
      ) : null}
    </div>
  );
}
