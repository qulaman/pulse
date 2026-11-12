"use client";

import { LayoutGroup, motion, MotionConfig } from "motion/react";
import { useState } from "react";

import { CARD_SPRING, CardShell } from "@/components/tasks/list/TaskList";
import { dayName, historyLine, pointsText, timeOf, durationText } from "@/lib/daily-report/format";
import type { DailyReport } from "@/lib/daily-report/types";

import { DayTasks } from "./DayTasks";

/**
 * «Прошлые отчёты» (D-152): one card a day, newest first — the day, «сдан · 8 ч 40 мин ·
 * 3 задачи · +1» or «не сдан · −10»; a tap opens it in place (the card language of «Мои дела»,
 * one open at a time): the times, the person's words, the tasks of that day.
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
    <MotionConfig reducedMotion="user">
      <LayoutGroup>
        <div className="flex flex-col gap-2" data-testid="report-history">
          {items.map((report) => {
            const open = openId === report.report_date;
            return (
              <motion.div key={report.report_date} layout="position" transition={CARD_SPRING}>
                <CardShell
                  id={`report-${report.report_date}`}
                  open={open}
                  closed={report.status === "missed"}
                  onToggle={() => setOpenId(open ? null : report.report_date)}
                  head={<HistoryHead report={report} now={now} />}
                >
                  <HistoryBody report={report} />
                </CardShell>
              </motion.div>
            );
          })}
        </div>
      </LayoutGroup>
    </MotionConfig>
  );
}

function HistoryHead({ report, now }: { report: DailyReport; now: Date }) {
  const missed = report.status === "missed";
  const points = pointsText(report.points);
  return (
    <>
      <span
        aria-hidden
        className="mt-[7px] h-2 w-2 shrink-0 rounded-full"
        style={{ background: missed ? "var(--danger)" : "var(--ok)", opacity: missed ? 0.8 : 1 }}
      />
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
