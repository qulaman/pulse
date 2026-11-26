"use client";

import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";

import { MiniMark } from "@/components/brand/MiniMark";
import { CARD_SPRING, CardShell } from "@/components/tasks/list/TaskList";
import { dayName, historyLine, pointsText, rangeText, reviewFacts, reviewMark } from "@/lib/daily-report/format";
import { finedMiss, foldHistory, gapLine, type HistoryItem } from "@/lib/daily-report/history";
import type { DailyReport } from "@/lib/daily-report/types";

import { DayTasks } from "./DayTasks";
import { CheckedWord, ReviewFacts } from "./ReviewFacts";

/** «Показать ещё» under the past days (D-198): the page before the loaded ones. */
export type MoreHistory = {
  /** There may be days before the loaded ones. */
  hasMore: boolean;
  onMore: () => void;
  loading: boolean;
  /** The last try failed: the button says so and tries again. */
  failed: boolean;
};

/**
 * «Прошлые отчёты» (D-152, D-198): one card a day, newest first — the day, the first line of the
 * person's words and the points once beside the day; «✓ проверен» or «просмотрен» at the end of the
 * line when the director has done it (nothing when not). A tap opens it in place (the card language
 * of «Мои дела», one open at a time): what happened to it («сдан 18:20 · просмотрен 18:41 · ✓
 * проверен 19:05»), the words in full, the tasks of that day. Three misses and more in a row are one
 * card (`foldHistory`); a miss is red only when it cost points; an excused one says the director's
 * reason. «Показать ещё» brings the days before.
 */
export function ReportHistory({ items, now, more }: { items: readonly DailyReport[]; now: Date; more?: MoreHistory }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0 && !more?.hasMore) {
    return (
      <p className="rounded-[20px] border border-border/70 px-6 py-7 text-center text-[15px] leading-[21px] text-muted">
        Здесь появятся сданные отчёты
      </p>
    );
  }

  return (
    <LayoutGroup>
      <div className="flex flex-col gap-2" data-testid="report-history">
        {foldHistory(items).map((item) => {
          const key = item.kind === "day" ? item.report.report_date : `gap-${item.newest}`;
          const open = openId === key;
          return (
            <motion.div key={key} layout="position" transition={CARD_SPRING}>
              <CardShell
                id={`report-${key}`}
                open={open}
                closed={item.kind === "gap" || item.report.status === "missed"}
                onToggle={() => setOpenId(open ? null : key)}
                head={item.kind === "day" ? <HistoryHead report={item.report} now={now} open={open} /> : <GapHead gap={item} />}
              >
                {item.kind === "day" ? <HistoryBody report={item.report} /> : <GapBody gap={item} now={now} />}
              </CardShell>
            </motion.div>
          );
        })}
        {more?.hasMore ? <MoreButton more={more} /> : null}
      </div>
    </LayoutGroup>
  );
}

/** One tap for the days before; it is gone once a page comes back short. */
function MoreButton({ more }: { more: MoreHistory }) {
  return (
    <motion.div layout="position" transition={CARD_SPRING}>
      <button
        type="button"
        onClick={more.loading ? undefined : more.onMore}
        aria-busy={more.loading || undefined}
        className="btn-secondary flex min-h-[48px] w-full items-center justify-center rounded-[14px] px-4 font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] text-text transition-transform duration-[120ms] active:scale-[0.98]"
        data-testid="report-history-more"
      >
        <span className={more.loading ? "text-muted" : undefined}>
          {more.loading ? (
            <>
              <MiniMark state="busy" tone="var(--accent)" className="mr-2" />
              Загружаю…
            </>
          ) : more.failed ? (
            "Не получилось — ещё раз"
          ) : (
            "Показать ещё"
          )}
        </span>
      </button>
    </motion.div>
  );
}

/** The day's dot: green — handed in, red — a miss that cost points, grey — a miss that cost nothing. */
function dotOf(report: DailyReport): string {
  if (report.status !== "missed") return "var(--ok)";
  return finedMiss(report) ? "var(--danger)" : "var(--text-muted)";
}

function HistoryHead({ report, now, open }: { report: DailyReport; now: Date; open: boolean }) {
  const missed = report.status === "missed";
  const points = pointsText(report.points);
  const mark = reviewMark(report);
  // open, the words are in full below: the line says what happened to the report instead, whole
  const facts = open ? reviewFacts(report) : [];
  return (
    <>
      <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: dotOf(report), opacity: missed ? 0.8 : 1 }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
          {dayName(report.report_date, now)}
        </span>
        {facts.length ? (
          <ReviewFacts facts={facts} className="block text-[13px] leading-[18px] text-muted" />
        ) : (
          <span className="flex min-w-0 items-baseline gap-2 text-[13px] leading-[18px] text-muted">
            <span className="min-w-0 flex-1 truncate" data-testid="report-history-line">
              {historyLine(report)}
            </span>
            {mark === "checked" ? (
              <span className="shrink-0" data-testid="report-history-mark" data-mark="checked">
                <CheckedWord text="проверен" />
              </span>
            ) : mark === "seen" ? (
              <span className="shrink-0" data-testid="report-history-mark" data-mark="seen">
                просмотрен
              </span>
            ) : null}
          </span>
        )}
      </span>
      {points ? (
        <span
          className="nums mt-0.5 shrink-0 text-[15px] font-semibold leading-5"
          style={{ color: report.points > 0 ? "var(--gold)" : "var(--text-muted)" }}
        >
          {points}
        </span>
      ) : null}
    </>
  );
}

type Gap = Extract<HistoryItem, { kind: "gap" }>;

function GapHead({ gap }: { gap: Gap }) {
  return (
    <>
      <span
        aria-hidden
        className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
        style={{ background: gap.points < 0 ? "var(--danger)" : "var(--text-muted)", opacity: 0.8 }}
      />
      <span className="min-w-0 flex-1">
        <span className="nums block truncate font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
          {rangeText(gap.oldest, gap.newest)}
        </span>
        <span className="block truncate text-[13px] leading-[18px] text-muted">{gapLine(gap)}</span>
      </span>
    </>
  );
}

/** The days of a folded run, one line each. */
function GapBody({ gap, now }: { gap: Gap; now: Date }) {
  return (
    <ul className="flex flex-col gap-1.5">
      {gap.reports.map((report) => (
        <li key={report.report_date} className="nums flex items-baseline justify-between gap-3 text-[14px] leading-[20px]">
          <span className="min-w-0 truncate">{dayName(report.report_date, now)}</span>
          <span className="shrink-0 text-muted">{report.points < 0 ? pointsText(report.points) : "без штрафа"}</span>
        </li>
      ))}
      {gap.points < 0 ? <li className="pt-1 text-[13px] leading-[18px] text-muted">Минус можно оспорить в истории очков — «Профиль», карточка очков.</li> : null}
    </ul>
  );
}

function HistoryBody({ report }: { report: DailyReport }) {
  if (report.status === "missed") {
    if (report.excused_at) {
      // D-183: the director's own words for the day — said in full, the head line cuts them
      return (
        <p className="text-[14px] leading-[20px] text-muted" data-testid="report-excused">
          Отчёт за этот день не сдан. Директор записал уважительную причину
          {report.excused_reason?.trim() ? (
            <>
              : <span className="whitespace-pre-wrap text-text">«{report.excused_reason.trim()}»</span>
            </>
          ) : null}
          .
        </p>
      );
    }
    return (
      <p className="text-[14px] leading-[20px] text-muted">
        Отчёт за этот день не сдан.
        {report.points < 0 ? " Минус можно оспорить в истории очков — «Профиль», карточка очков." : ""}
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {report.summary?.trim() ? <p className="whitespace-pre-wrap text-[15px] leading-[22px]">{report.summary.trim()}</p> : null}
      <DayTasks tasks={report.tasks} flat />
    </div>
  );
}
