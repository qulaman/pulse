"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";

import { Button } from "@/components/ui/Button";
import { PageHead } from "@/components/ui/PageHead";
import { dayState, dayTitle, formProblem, pointsHint, reviewFacts, SUMMARY_MAX, timeOf } from "@/lib/daily-report/format";
import { readDraft, writeDraft } from "@/lib/daily-report/draft";
import type { DailyReport, MyDailyReportDay, SubmitDailyReportInput } from "@/lib/daily-report/types";
import { fitHeight } from "@/lib/ui/fitHeight";

import { DayTasks } from "./DayTasks";
import { PointsPop, type Pop } from "./PointsPop";
import { ReportHistory, type MoreHistory } from "./ReportHistory";
import { ReviewFacts } from "./ReviewFacts";
import { HistoryBone } from "./Skeletons";
import { Icon } from "@/components/tasks/icons";

const FIELD =
  "w-full field px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";
const MAX_FIELD_PX = 360;

/**
 * «Отчёт за день» (D-152, D-198): the day and its state in the head, the tasks the day closed
 * (written in by themselves), «Что сделали», one button — «Сдать отчёт», later «Сохранить» while
 * the day lasts — and the past days below. No «Пришёл / Ушёл»: the report is the words, the tasks
 * and the moment it went (D-198). After the hand-in the director's marks stand under it, only those
 * that happened. The data is the page's (`useMyDailyReport`).
 */
export function MyReportView({
  day,
  history,
  more,
  now,
  onSubmit,
  waiting = false,
  pop = null,
}: {
  day: MyDailyReportDay;
  /** Past days, newest first; undefined while they load. */
  history: readonly DailyReport[] | undefined;
  /** «Показать ещё» under the past days; absent — everything is here. */
  more?: MoreHistory;
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
        tone={state.tone === "ok" ? "ok" : "muted"}
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
      <div className="mt-2">{past ? <ReportHistory items={past} now={now} more={more} /> : <HistoryBone />}</div>
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
  // a draft of this day wins over what is handed in — it is what the person typed since
  const [initial] = useState<{ summary: string; restored: boolean }>(() => {
    const draft = typeof window === "undefined" ? null : readDraft(day.date);
    if (draft) return { summary: draft.summary, restored: true };
    return { summary: saved?.summary ?? "", restored: false };
  });
  const [summary, setSummary] = useState(initial.summary);
  const [tried, setTried] = useState(false);
  // a draft is what the person did: an untouched form writes none
  const [touched, setTouched] = useState(initial.restored);
  const field = useRef<HTMLTextAreaElement>(null);

  // D-183: one line of the person's own words always — the director reads them; the tasks go in by themselves
  const hasTasks = day.tasks.length > 0;
  const problem = formProblem(summary);
  const wordsMissing = !summary.trim();
  const dirty = !saved || (saved.summary ?? "").trim() !== summary.trim();

  // the words survive a reload until the server has them
  useEffect(() => {
    if (touched) writeDraft(dirty ? { date: day.date, summary } : null);
  }, [touched, dirty, day.date, summary]);

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
    if (problem) {
      if (wordsMissing) field.current?.focus();
      return;
    }
    // D-198: the report asks no «Пришёл / Ушёл» — the moment it goes is the server's; `date` is the
    // Aqtobe day of the tap, which alone tells a report sent offline before midnight from the next day's
    onSubmit({ arrived_at: null, left_at: null, date: day.date, summary: summary.trim(), client_request_id: crypto.randomUUID() });
  };

  const tooLong = summary.trim().length > SUMMARY_MAX;
  // the director's marks under the plate — «сдан» is the plate itself
  const marks = saved && !waiting ? reviewFacts(saved).filter((fact) => fact.kind !== "submitted") : [];

  return (
    <>
      <h2 className="eyebrow mt-4 flex items-center gap-1.5 px-1">
        Закрыто сегодня
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
        Что сделали
        {hasTasks ? (
          <span className="font-normal normal-case tracking-normal text-muted" data-testid="report-summary-tasks">
            {" "}
            · одной строкой — задачи дня уже в отчёте
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
      ) : saved && dirty ? (
        <p className="mt-2 px-1 text-center text-[13px] leading-[18px] text-muted" data-testid="report-edit-hint">
          {/* D-198: said before the save, no tap more — the check comes off with new words */}
          {saved.checked_at ? "Директор уже проверил — после правки отметка снимется" : "Сохраню поверх сданного — очки второй раз не начисляются"}
        </p>
      ) : saved ? (
        <div className="mt-2 px-1 text-center text-[13px] leading-[18px] text-muted">
          {marks.length ? <ReviewFacts facts={marks} capital className="block" /> : null}
          <p className={marks.length ? "mt-0.5" : undefined}>Можно поправить до конца дня</p>
        </div>
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
