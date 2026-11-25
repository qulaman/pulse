"use client";

import { LayoutGroup, motion } from "motion/react";
import { useState } from "react";

import { CARD_SPRING, CardShell } from "@/components/tasks/list/TaskList";
import { dayName, historyLine, pointsText, rangeText, timeOf, durationText } from "@/lib/daily-report/format";
import { finedMiss, foldHistory, gapLine, type HistoryItem } from "@/lib/daily-report/history";
import type { DailyReport } from "@/lib/daily-report/types";

import { DayTasks } from "./DayTasks";

/**
 * «Прошлые отчёты» (D-152): one card a day, newest first — the day, «сдан · 8 ч 40 мин ·
 * 3 задачи · +1» or «не сдан · −10»; a tap opens it in place (the card language of «Мои дела»,
 * one open at a time): the times, the person's words, the tasks of that day. Three misses and more
 * in a row are one card (`foldHistory`); a miss is red only when it cost points.
 */
export function ReportHistory({ items, now }: { items: readonly DailyReport[]; now: Date }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
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
                head={item.kind === "day" ? <HistoryHead report={item.report} now={now} /> : <GapHead gap={item} />}
              >
                {item.kind === "day" ? <HistoryBody report={item.report} /> : <GapBody gap={item} now={now} />}
              </CardShell>
            </motion.div>
          );
        })}
      </div>
    </LayoutGroup>
  );
}

/** The day's dot: green — handed in, red — a miss that cost points, grey — a miss that cost nothing. */
function dotOf(report: DailyReport): string {
  if (report.status !== "missed") return "var(--ok)";
  return finedMiss(report) ? "var(--danger)" : "var(--text-muted)";
}

function HistoryHead({ report, now }: { report: DailyReport; now: Date }) {
  const missed = report.status === "missed";
  const points = pointsText(report.points);
  return (
    <>
      <span aria-hidden className="mt-[7px] h-2 w-2 shrink-0 rounded-full" style={{ background: dotOf(report), opacity: missed ? 0.8 : 1 }} />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[16px] font-semibold leading-[22px] tracking-[-0.01em]">
          {dayName(report.report_date, now)}
        </span>
        <span className="block truncate text-[13px] leading-[18px] text-muted">{historyLine(report)}</span>
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
    return (
      <p className="text-[14px] leading-[20px] text-muted">
        Отчёт за этот день не сдан.
        {report.points < 0 ? " Минус можно оспорить в истории очков — «Профиль», карточка очков." : ""}
      </p>
    );
  }
  const length = durationText(report.arrived_at, report.left_at);
  return (
    <div className="flex flex-col gap-3">
      <p className="nums text-[14px] leading-[20px] text-muted">
        Пришёл <span className="text-text">{timeOf(report.arrived_at)}</span> · ушёл{" "}
        <span className="text-text">{timeOf(report.left_at)}</span>
        {length ? ` · ${length}` : ""}
      </p>
      {report.summary ? <p className="whitespace-pre-wrap text-[15px] leading-[22px]">{report.summary}</p> : null}
      <DayTasks tasks={report.tasks} flat />
    </div>
  );
}
