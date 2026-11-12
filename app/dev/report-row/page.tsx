"use client";

import { useMemo, useState, useSyncExternalStore, type ReactNode } from "react";

import type { Pop } from "@/components/daily-report/PointsPop";
import { ReportDueRow, ReportDueRowView } from "@/components/feed/ReportDueRow";
import { reportDue } from "@/lib/daily-report/due";
import type { DailyReportTask, MyDailyReportDay } from "@/lib/daily-report/types";
import { todayYmd } from "@/lib/datetime/calendar";

/**
 * Component sandbox (D-167): «Отчёт за день» at the top of «Дела» on Лента in every state, from
 * made-up days — nothing is read or written. `?live=17:30` adds the real row (the person's own day
 * through `my_daily_report`) on a clock set to that Aqtobe time; its «Сдать» posts for real, so a
 * smoke intercepts `POST /api/daily-report`.
 */

const TODAY = todayYmd();
const at = (hm: string) => new Date(`${TODAY}T${hm}:00+05:00`);

const task = (id: string): DailyReportTask => ({
  id,
  title: "Сверка",
  status: "pending_review",
  completed_at: `${TODAY}T12:00:00+05:00`,
  closed_at: null,
  on_time: true,
});

function day(patch: Partial<MyDailyReportDay> = {}): MyDailyReportDay {
  return {
    date: TODAY,
    today: true,
    workday: true,
    holiday: false,
    enabled: true,
    report: null,
    tasks: [task("t1"), task("t2"), task("t3")],
    suggest: { arrived_at: `${TODAY}T09:00:00+05:00`, left_at: `${TODAY}T12:00:00+05:00` },
    points: { enabled: true, reward: 1, penalty: 10 },
    ...patch,
  };
}

const submitted = (hm: string): MyDailyReportDay["report"] => ({
  id: "r1",
  user_id: "u1",
  report_date: TODAY,
  status: "submitted",
  arrived_at: `${TODAY}T09:00:00+05:00`,
  left_at: `${TODAY}T${hm}:00+05:00`,
  summary: "",
  tasks: [],
  submitted_at: `${TODAY}T${hm}:00+05:00`,
  updated_at: `${TODAY}T${hm}:00+05:00`,
  points: 1,
});

const STATES: { id: string; label: string; due: ReturnType<typeof reportDue>; waiting?: boolean }[] = [
  { id: "quiet-one", label: "11:40 · задачи есть — тихо, «Сдать»", due: reportDue(day(), at("11:40")) },
  { id: "quiet-write", label: "11:40 · задач нет — тихо, «Написать»", due: reportDue(day({ tasks: [] }), at("11:40")) },
  { id: "quiet-nopoints", label: "11:40 · задач нет, очки выключены", due: reportDue(day({ tasks: [], points: { enabled: false, reward: 1, penalty: 0 } }), at("11:40")) },
  { id: "asking-one", label: "17:05 · задачи есть — просит, «Сдать»", due: reportDue(day(), at("17:05")) },
  { id: "asking-one-1", label: "17:05 · одна задача", due: reportDue(day({ tasks: [task("t1")] }), at("17:05")) },
  { id: "asking-write", label: "17:05 · задач нет — просит, «Написать»", due: reportDue(day({ tasks: [] }), at("17:05")) },
  { id: "submitted", label: "сдан в 17:42", due: reportDue(day({ report: submitted("17:42") }), at("18:10")) },
  { id: "waiting", label: "сдан без сети", due: reportDue(day({ report: submitted("17:42") }), at("18:10")), waiting: true },
];

const HIDDEN: { label: string; due: ReturnType<typeof reportDue> }[] = [
  { label: "выходной", due: reportDue(day({ workday: false }), at("18:00")) },
  { label: "праздник", due: reportDue(day({ workday: false, holiday: true }), at("18:00")) },
  { label: "отчёты выключены", due: reportDue(day({ enabled: false }), at("18:00")) },
  { label: "в отпуске", due: reportDue(day(), at("18:00"), "17:00", true) },
];

const noop = () => () => {};

/** The panel's own surface, so the row is seen where it lives: on top of «Дела». */
function Panel({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="flex flex-col gap-2" aria-label={label}>
      <p className="px-1 text-[12px] leading-4 text-muted">{label}</p>
      <div className="flex flex-col gap-3 rounded-[24px] px-4 py-4" style={{ background: "var(--surface)" }}>
        {children}
        <div className="card flex min-h-[72px] items-center px-4 text-[15px] text-muted">Карточка задачи</div>
      </div>
    </section>
  );
}

/** «Сдать» played on the phone alone: the day flips to handed in, «+1 очко» rises a moment later. */
function Simulated({ hm }: { hm: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [pop, setPop] = useState<Pop | null>(null);
  const now = useMemo(() => at(hm), [hm]);
  const due = useMemo(() => reportDue(day(sent ? { report: submitted(sent) } : {}), now, "17:00"), [sent, now]);
  const from = reportDue(day(), now, "17:00").asking ? "asking" : "quiet";
  return (
    <Panel label={`${hm} · нажми «Сдать» — сдаётся сразу, очки поверх (ничего не пишется)`}>
      <div data-testid={`simulated-${from}`}>
        <ReportDueRowView
          due={due}
          pop={pop}
          sentFrom={sent ? from : null}
          onSubmit={() => {
            setSent(hm);
            setTimeout(() => setPop({ key: Date.now(), amount: 1 }), 350);
          }}
        />
      </div>
      <button type="button" className="self-start text-[13px] text-accent underline" onClick={() => setSent(null)}>
        Вернуть
      </button>
    </Panel>
  );
}

export default function ReportRowSandbox() {
  // read after hydration: the server has no address bar
  const search = useSyncExternalStore(noop, () => window.location.search, () => "");
  const live = new URLSearchParams(search).get("live");
  return (
    <main className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6" style={{ background: "var(--bg)" }}>
      <h1 className="font-display text-[20px] font-semibold">Отчёт за день в «Делах»</h1>
      {live ? (
        <Panel label={`живая строка, часы ${live}`}>
          <div data-testid="live">
            <ReportDueRow now={at(live)} />
          </div>
        </Panel>
      ) : null}
      <Simulated hm="17:20" />
      <Simulated hm="11:20" />
      {STATES.map((state) => (
        <Panel key={state.id} label={state.label}>
          <div data-testid={`state-${state.id}`}>
            <ReportDueRowView due={state.due} waiting={state.waiting} onSubmit={() => {}} />
          </div>
        </Panel>
      ))}
      <p className="px-1 text-[13px] leading-[18px] text-muted">
        Строки нет: {HIDDEN.map((item) => `${item.label} — ${item.due.show ? "ЕСТЬ (ошибка)" : "нет"}`).join(" · ")}
      </p>
    </main>
  );
}
