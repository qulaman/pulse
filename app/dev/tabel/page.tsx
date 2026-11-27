"use client";

import { useState, useSyncExternalStore } from "react";

import { MyTabelCard } from "@/components/daily-report/MyTabel";
import { monthOfDay, monthSteps, myTabelMonth } from "@/lib/daily-report/my-tabel";
import type { DailyReport, DailyReportTask } from "@/lib/daily-report/types";
import { addDays, ymdOf, type Month, type Ymd } from "@/lib/datetime/calendar";
import type { ReportPerson, ReportRules } from "@/lib/people/stats";

/**
 * Component sandbox (D-219): «Табель» of /report on a made-up month — every state a day can have:
 * handed in (seen, checked, on a day off), missed with and without a fine, excused, away, a
 * holiday, today, days to come. Nothing is read or written. `?blank` — the card before its data,
 * `?failed` — the reports did not load.
 */

const TODAY: Ymd = "2026-11-18";
const RULES: ReportRules = { enabled: true, workdays: [1, 2, 3, 4, 5], holidays: ["2026-11-05"], started_on: "2026-10-12", checked_on: "2026-11-17" };
const PERSON: ReportPerson = { is_active: true, role: "employee", availability: "active", created_at: "2026-10-08T04:00:00Z" };

const task = (id: string, title: string, done = true): DailyReportTask => ({
  id,
  title,
  status: done ? "done" : "pending_review",
  completed_at: null,
  closed_at: null,
  on_time: done ? true : null,
});

function handedIn(day: Ymd, summary: string, over: Partial<DailyReport> = {}): DailyReport {
  return {
    id: `r-${day}`,
    user_id: "u1",
    report_date: day,
    status: "submitted",
    arrived_at: null,
    left_at: null,
    summary,
    tasks: [],
    submitted_at: `${day}T18:04:00+05:00`,
    updated_at: `${day}T18:04:00+05:00`,
    points: 1,
    excused_at: null,
    excused_reason: null,
    seen_at: null,
    checked_at: null,
    ...over,
  };
}

const missed = (day: Ymd, over: Partial<DailyReport> = {}): DailyReport =>
  handedIn(day, "", { status: "missed", summary: null, submitted_at: null, points: -10, ...over });

const REPORTS: DailyReport[] = [
  handedIn("2026-11-02", "Сверил объёмы по кровле с подрядчиком, расхождение 14 м² — акт переделывают.\nЗаказал крепёж на склад.", {
    seen_at: "2026-11-02T18:40:00+05:00",
    checked_at: "2026-11-02T19:05:00+05:00",
    tasks: [task("t1", "Акт сверки с «Кровля-Сервис»"), task("t2", "Заявка на крепёж", false)],
  }),
  missed("2026-11-03"),
  missed("2026-11-04", { points: 0 }),
  missed("2026-11-06", { points: 0, excused_at: "2026-11-07T10:00:00+05:00", excused_reason: "Был у врача, предупредил заранее" }),
  handedIn("2026-11-07", "Вышел в субботу принять бетон", { points: 0 }),
  handedIn("2026-11-09", "Приёмка цемента, склад", { seen_at: "2026-11-09T19:12:00+05:00" }),
  handedIn("2026-11-12", "Смета по второму корпусу"),
  handedIn("2026-11-13", "Объезд объектов"),
  handedIn("2026-11-16", "Планёрка, заявки на технику"),
  handedIn("2026-11-17", "Документы по приёмке", { checked_at: "2026-11-18T09:20:00+05:00", seen_at: "2026-11-18T09:19:00+05:00" }),
  // October: the reports started on the 12th
  handedIn("2026-10-12", "Первый день: знакомство с объектами"),
  ...["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16"].map((day) => missed(day, { points: 0 })),
  ...Array.from({ length: 10 }, (_, i) => addDays("2026-10-19", i))
    .filter((day) => !["2026-10-24", "2026-10-25"].includes(day))
    .map((day) => handedIn(day, "Работа на объекте")),
];

const noStore = () => () => undefined;

export default function TabelSandbox() {
  const [month, setMonth] = useState<Month>(monthOfDay(TODAY));
  const [direction, setDirection] = useState(0);
  // the address is the browser's: the server's frame draws the month, the switches come with hydration
  const search = useSyncExternalStore(noStore, () => window.location.search, () => "");
  const params = new URLSearchParams(search);
  const blank = params.has("blank");
  const failed = params.has("failed");
  const steps = monthSteps(month, TODAY, PERSON.created_at);
  const from = ymdOf(month.year, month.month, 1);
  const rows = REPORTS.filter((report) => report.report_date.slice(0, 7) === from.slice(0, 7));

  return (
    <main className="mx-auto w-full max-w-lg px-4 pb-24 pt-6">
      <h2 className="eyebrow px-1">Табель</h2>
      <MyTabelCard
        month={month}
        today={TODAY}
        weeks={blank || failed ? null : myTabelMonth(month, rows, TODAY, RULES, PERSON)}
        rules={RULES}
        direction={direction}
        prev={steps.prev}
        next={steps.next}
        onStep={(target, delta) => {
          setDirection(delta);
          setMonth(target);
        }}
        failed={failed}
        onRetry={() => undefined}
      />
    </main>
  );
}
