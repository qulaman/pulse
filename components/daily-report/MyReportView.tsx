"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import {
  dayState,
  dayTitle,
  durationText,
  formProblem,
  hmOf,
  isoAt,
  pointsHint,
  SUMMARY_MAX,
  timeOf,
} from "@/lib/daily-report/format";
import type { DailyReport, MyDailyReportDay, SubmitDailyReportInput } from "@/lib/daily-report/types";
import type { Hm } from "@/lib/datetime/calendar";
import { fitHeight } from "@/lib/ui/fitHeight";

import { DayTasks } from "./DayTasks";
import { PointsPop, type Pop } from "./PointsPop";
import { ReportHistory } from "./ReportHistory";
import { HistoryBone } from "./Skeletons";
import { TimePair } from "./TimePair";

const FIELD =
  "w-full field px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";
const MAX_FIELD_PX = 360;

/** What the phone keeps of an unsent form, so a reload or an update does not eat the words. */
const DRAFT_KEY = "pulse.daily-report.draft.v1";
type Draft = { date: string; arrived: Hm | null; left: Hm | null; summary: string };

function readDraft(date: string): Draft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    const draft = raw ? (JSON.parse(raw) as Draft) : null;
    return draft?.date === date ? draft : null;
  } catch {
    return null;
  }
}

function writeDraft(draft: Draft | null): void {
  try {
    if (draft) window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    // private mode or a full store: the form still holds the words while the screen is open
  }
}

/**
 * «Отчёт за день» (D-152): the day and its state in the head, «Пришёл / Ушёл» prefilled, the
 * tasks the day closed (written in by themselves), «Чем занимался», one button — «Сдать
 * отчёт», later «Сохранить» while the day lasts — and the past days below. The data is the
 * page's (`useMyDailyReport`).
 */
export function MyReportView({
  day,
  history,
  now,
  onSubmit,
  waiting = false,
  pop = null,
}: {
  day: MyDailyReportDay;
  /** Past days, newest first; undefined while they load. */
  history: readonly DailyReport[] | undefined;
  now: Date;
  onSubmit: (input: SubmitDailyReportInput) => void;
  /** The submit waits for the network (it is on the phone, the outbox delivers it). */
  waiting?: boolean;
  /** «+1» to play over the button. */
  pop?: Pop | null;
}) {
  const state = dayState(day);
  const past = history?.filter((report) => report.report_date !== day.date);
  // D-155 §1: before the first report handed in, a miss is not fined — the form says so
  const handedInBefore = past ? past.some((report) => report.status === "submitted") : undefined;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36">
      <PageHead
        eyebrow={dayTitle(day.date)}
        title="Отчёт за день"
        tone={state.tone === "none" ? undefined : state.tone}
        state={waiting ? "Сдан · ждёт связи" : state.text}
      />

      {day.enabled ? (
        <ReportForm key={day.date} day={day} handedInBefore={handedInBefore} onSubmit={onSubmit} waiting={waiting} pop={pop} />
      ) : (
        <div className="card-in mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center" data-testid="reports-off">
          <Mascot state="calm" size={56} />
          <p className="mt-3 font-display text-[17px] font-semibold">Отчёты выключены</p>
          <p className="mt-1 text-[14px] leading-[19px] text-muted">Директор включает их в настройках — тогда здесь появится форма</p>
        </div>
      )}

      <h2 className="eyebrow mt-8 px-1">Прошлые отчёты</h2>
      <div className="mt-2">{past ? <ReportHistory items={past} now={now} /> : <HistoryBone />}</div>
    </main>
  );
}

function ReportForm({
  day,
  handedInBefore,
  onSubmit,
  waiting,
  pop,
}: {
  day: MyDailyReportDay;
  /** A report handed in on an earlier day; undefined while the past days load. */
  handedInBefore: boolean | undefined;
  onSubmit: (input: SubmitDailyReportInput) => void;
  waiting: boolean;
  pop: Pop | null;
}) {
  const saved = day.report?.status === "submitted" ? day.report : null;
  // a draft of this day wins over the suggestion — it is what the person already typed
  const [initial] = useState<Draft & { restored: boolean }>(() => {
    const draft = typeof window === "undefined" ? null : readDraft(day.date);
    if (draft) return { ...draft, restored: true };
    return {
      date: day.date,
      arrived: hmOf(saved?.arrived_at ?? day.suggest.arrived_at),
      left: hmOf(saved?.left_at ?? day.suggest.left_at),
      summary: saved?.summary ?? "",
      restored: false,
    };
  });
  const [arrived, setArrived] = useState<Hm | null>(initial.arrived);
  const [left, setLeft] = useState<Hm | null>(initial.left);
  const [summary, setSummary] = useState(initial.summary);
  const [tried, setTried] = useState(false);
  // a draft is what the person did: an untouched form keeps taking the fresh suggestion
  const [touched, setTouched] = useState(initial.restored);
  const field = useRef<HTMLTextAreaElement>(null);

  const arrivedIso = arrived ? isoAt(day.date, arrived) : null;
  const leftIso = left ? isoAt(day.date, left) : null;
  const length = durationText(arrivedIso, leftIso);
  // D-155 §7: the day's tasks are the report already — the words may stay empty then
  const hasTasks = day.tasks.length > 0;
  const problem = formProblem(arrivedIso, leftIso, summary, hasTasks);
  const wordsMissing = !summary.trim() && !hasTasks;
  const dirty =
    !saved || (saved.summary ?? "").trim() !== summary.trim() || hmOf(saved.arrived_at) !== arrived || hmOf(saved.left_at) !== left;

  // the words survive a reload until the server has them
  useEffect(() => {
    if (touched) writeDraft(dirty ? { date: day.date, arrived, left, summary } : null);
  }, [touched, dirty, day.date, arrived, left, summary]);

  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    if (!summary) {
      node.style.height = "";
      return;
    }
    fitHeight(node, MAX_FIELD_PX, 2);
  }, [summary]);

  const submit = () => {
    setTried(true);
    if (problem || !arrivedIso || !leftIso) {
      if (arrivedIso && leftIso && wordsMissing) field.current?.focus();
      return;
    }
    onSubmit({ arrived_at: arrivedIso, left_at: leftIso, summary: summary.trim(), client_request_id: crypto.randomUUID() });
  };

  const late = Boolean(arrivedIso && leftIso && !length);
  const tooLong = summary.trim().length > SUMMARY_MAX;

  return (
    <>
      <section className="card mt-3 p-4" aria-label="Время на работе">
        <TimePair
          arrived={arrived}
          left={left}
          onArrived={(hm) => {
            setTouched(true);
            setArrived(hm);
          }}
          onLeft={(hm) => {
            setTouched(true);
            setLeft(hm);
          }}
        />
        <p
          className={`nums mt-2 min-h-[20px] px-1 text-[14px] leading-5 ${late ? "text-danger" : "text-muted"}`}
          data-testid="report-length"
        >
          {late ? "«Ушёл» должно быть позже «Пришёл»" : length ? `${length} на работе` : " "}
        </p>
      </section>

      <h2 className="eyebrow mt-6 flex items-center gap-1.5 px-1">
        Закрыл сегодня
        {day.tasks.length ? <span className="nums text-muted">{day.tasks.length}</span> : null}
      </h2>
      <div className="mt-2">
        <DayTasks
          tasks={day.tasks}
          empty={
            <p className="rounded-[16px] border border-border/70 px-4 py-4 text-[14px] leading-[19px] text-muted">
              Сегодня ничего не сдано — напишите, чем занимались
            </p>
          }
        />
      </div>

      <label htmlFor="report-summary" className="eyebrow mt-6 block px-1">
        Чем занимался
        {hasTasks ? (
          <span className="font-normal normal-case tracking-normal text-muted" data-testid="report-summary-optional">
            {" "}
            · необязательно — задачи дня уже в отчёте
          </span>
        ) : null}
      </label>
      <textarea
        id="report-summary"
        ref={field}
        rows={4}
        value={summary}
        onChange={(event) => {
          setTouched(true);
          setSummary(event.target.value);
        }}
        placeholder="Пара строк: что сделано, где были, что мешало"
        autoCapitalize="sentences"
        aria-invalid={tried && wordsMissing ? true : undefined}
        className={`${FIELD} mt-2 resize-none ${tried && wordsMissing ? "border-danger" : ""}`}
        data-testid="report-summary"
      />
      {summary.length > SUMMARY_MAX - 500 ? (
        <p className={`nums mt-1 px-1 text-right text-[13px] leading-4 ${tooLong ? "text-danger" : "text-muted"}`}>
          {summary.trim().length} / {SUMMARY_MAX}
        </p>
      ) : null}

      <div className="relative mt-4">
        <PointsPop pop={pop} />
        {saved && !dirty ? (
          <p
            className="card-in flex min-h-[52px] items-center justify-center gap-2 rounded-[12px] border border-ok/40 bg-ok/10 px-4 text-[15px] font-semibold leading-5 text-ok"
            data-testid="report-done"
          >
            <Icon name="check" size={18} />
            {waiting ? "Отправлю, как появится связь" : `Сдан в ${timeOf(saved.submitted_at)}`}
          </p>
        ) : (
          <Button block size="lg" onClick={submit} data-testid="report-submit">
            {saved ? "Сохранить" : "Сдать отчёт"}
          </Button>
        )}
      </div>

      {tried && problem && dirty ? (
        <p role="alert" className="mt-2 px-1 text-center text-[14px] leading-5 text-danger">
          {problem}
        </p>
      ) : saved ? (
        <p className="mt-2 px-1 text-center text-[13px] leading-[18px] text-muted">
          {dirty ? "Сохраню поверх сданного — очки второй раз не начисляются" : "Можно поправить до конца дня"}
        </p>
      ) : day.workday && day.points.enabled ? (
        <p className="nums mt-2 px-1 text-center text-[13px] leading-[18px] text-muted" data-testid="report-points-hint">
          {pointsHint(day, handedInBefore).map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>
      ) : null}
    </>
  );
}
