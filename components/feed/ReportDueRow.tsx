"use client";

import { AnimatePresence, motion, MotionConfig } from "motion/react";
import Link from "next/link";
import { useRef, useState, type CSSProperties } from "react";

import { ReportDoneIcon, ReportIcon } from "@/components/daily-report/icons";
import { PointsPop, type Pop } from "@/components/daily-report/PointsPop";
import { Icon } from "@/components/tasks/desk/icons";
import { Button } from "@/components/ui/Button";
import { HapticSwitch } from "@/components/ui/HapticSwitch";
import { clearDraft, readDraft } from "@/lib/daily-report/draft";
import { oneTapInput, type ReportDue } from "@/lib/daily-report/due";
import { pointsText, timeOf } from "@/lib/daily-report/format";
import { useMyDailyReport, useRefreshAfterReplay, useReportDue, useSubmitDailyReport, useSubmitWaiting } from "@/lib/daily-report/queries";
import { springs } from "@/lib/design/tokens";
import { isNetworkError } from "@/lib/net";
import { pluralRu } from "@/lib/tasks/status-text";

type Look = "quiet" | "asking" | "submitted";

const PLAIN = "rounded-[16px] border border-border/70 bg-surface-2/60";

const BOX: Record<Look, { className: string; style?: CSSProperties }> = {
  // a line among the cards, not a card of its own: it is there all day and asks for nothing yet
  quiet: { className: PLAIN },
  // the evening: a card like the tasks', its edge in the accent — noticed, not shouting
  asking: {
    className: "card",
    style: {
      borderColor: "color-mix(in srgb, var(--accent) 45%, var(--border))",
      background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 9%, var(--surface)), var(--surface) 70%)",
    },
  },
  submitted: { className: PLAIN },
};

const TILE: Record<Look, CSSProperties> = {
  quiet: { background: "var(--surface-2)", color: "var(--text-muted)" },
  asking: { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--accent)" },
  submitted: { background: "color-mix(in srgb, var(--ok) 15%, transparent)", color: "var(--ok)" },
};

const LINK_BUTTON =
  "relative inline-flex min-h-[44px] select-none items-center justify-center whitespace-nowrap rounded-[12px] px-4 font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] transition-transform duration-[120ms] ease-out active:scale-[0.97] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-accent/35";
const EDIT_LINK = `${LINK_BUTTON} px-2.5 font-medium text-muted`;
/** «Сдан» where «Сдать» was: the same box, nothing to press — a second tap lands on nothing. */
const DONE_PILL =
  "inline-flex min-h-[44px] items-center justify-center gap-1.5 whitespace-nowrap rounded-[12px] border border-ok/40 bg-ok/10 px-4 font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] text-ok";

/** A thing swaps in place: in on the object spring, out faster than in (DESIGN §4). */
const SWAP = {
  initial: { opacity: 0, y: 6, scale: 0.92 },
  animate: { opacity: 1, y: 0, scale: 1, transition: springs.object },
  exit: { opacity: 0, y: -10, transition: { duration: 0.14, ease: [0.4, 0, 1, 1] as const } },
};

/**
 * «Отчёт за день» at the top of «Дела» on Лента (D-167) — the whole day, from the data alone:
 * before `ask_from` a quiet line; from it a card that says the report is not in; on a day with
 * tasks «Сдать» hands it in at once (the tasks are the report, D-155 §7) with «Изменить ›» to
 * /report beside it; without tasks «Написать ›» leads to the form; handed in — «Сдан в 17:42 ✓».
 * Not there on a day off, a holiday, with reports off or for a person on leave (`reportDue`).
 * `now` — the screen's minute clock.
 */
export function ReportDueRow({ now }: { now: Date }) {
  const day = useMyDailyReport();
  const due = useReportDue(now);
  const submit = useSubmitDailyReport();
  // a submit the outbox delivered on this start turns the row green without a reload
  useRefreshAfterReplay();
  // the provisional report stays until the server's comes back (`pending-<key>`)
  const waiting = useSubmitWaiting() && Boolean(day.data?.report?.id.startsWith("pending-"));
  const [pop, setPop] = useState<Pop | null>(null);
  // where «Сдать» was tapped: the row keeps that shape while it is on screen (nothing moves under the finger)
  const [sentFrom, setSentFrom] = useState<SentFrom | null>(null);
  // a second tap in the same frame — the button still leaving under the finger — sends nothing
  // (principle 7): only a refusal that put the row back opens it again
  const sending = useRef(false);

  if (!due.show) return null;

  const send = () => {
    if (!day.data || day.data.report || sending.current) return;
    const date = day.data.date;
    // the moment of the tap, not the screen's minute: «Ушёл» is now — unless the person set it on
    // /report: what they typed there goes in (tasks/032)
    const input = oneTapInput(day.data, new Date(), crypto.randomUUID(), readDraft(date));
    if (!input) return;
    sending.current = true;
    setSentFrom(due.asking ? "asking" : "quiet");
    submit.mutate(input, {
      onError: (error) => {
        // without network the outbox keeps it — still handed in; a refusal rolled the row back
        if (!isNetworkError(error)) sending.current = false;
      },
      // the day is written already (optimistic); the points rise over it after the server says so (1a)
      onSuccess: (result) => {
        // the server has the day's report: the draft is done with, as the form drops it after a submit
        clearDraft(date);
        if (result.points_awarded > 0) setPop({ key: Date.now(), amount: result.points_awarded });
      },
    });
  };

  return <ReportDueRowView due={due} waiting={waiting} pop={pop} onSubmit={send} sentFrom={sentFrom} />;
}

/** The look the row had when «Сдать» was tapped on it. */
export type SentFrom = "quiet" | "asking";

/** The row itself, from props — the sandbox (/dev/report-row) draws every state with it. */
export function ReportDueRowView({
  due,
  waiting = false,
  pop = null,
  onSubmit,
  sentFrom = null,
}: {
  due: ReportDue;
  /** Handed in on the phone, the outbox delivers it when the network comes. */
  waiting?: boolean;
  /** «+1 очко» over the row. */
  pop?: Pop | null;
  /** «Сдать»: hands today's report in as it is; used only when `due.oneTap`. */
  onSubmit?: () => void;
  /** «Сдать» was tapped here, from this look: the handed-in row keeps its shape, «Сдан» where «Сдать» was. */
  sentFrom?: SentFrom | null;
}) {
  if (!due.show) return null;
  const look: Look = due.submitted ? "submitted" : due.asking ? "asking" : "quiet";
  const box = BOX[look];
  const asking = look === "asking";
  const justSent = due.submitted ? sentFrom : null;
  // the evening card has a line of its own for the actions — and keeps it right after «Сдать»
  const actionsLine = asking || justSent === "asking";

  const title = asking ? "Отчёт за день не сдан" : "Отчёт за день";
  const sub = due.submitted ? (
    <span className="inline-flex items-center gap-1 font-semibold text-ok" data-testid="report-due-done">
      {waiting ? "Сдан · ждёт связи" : `Сдан в ${timeOf(due.submittedAt)}`}
      {waiting ? null : <Icon name="check" size={14} />}
    </span>
  ) : due.oneTap ? (
    `Задачи дня войдут сами: ${due.tasks}`
  ) : asking ? (
    "Напишите пару строк о дне"
  ) : due.reward > 0 ? (
    `${pointsText(due.reward)} ${pluralRu(due.reward, ["очко", "очка", "очков"])} за сданный`
  ) : (
    "До конца дня"
  );

  // the right edge of the first line
  const side = actionsLine ? null : due.submitted ? (
    justSent === "quiet" ? (
      <motion.span key="done" {...SWAP} className={DONE_PILL} data-testid="report-due-sent">
        <Icon name="check" size={16} />
        Сдан
      </motion.span>
    ) : (
      <motion.span key="edit" {...SWAP} className="inline-flex">
        <Link href="/report" className={EDIT_LINK} data-testid="report-due-edit">
          Изменить ›
          <HapticSwitch />
        </Link>
      </motion.span>
    )
  ) : due.oneTap ? (
    <motion.span key="send" {...SWAP} className="inline-flex">
      <Button variant="secondary" onClick={onSubmit} className="whitespace-nowrap" data-testid="report-due-send">
        Сдать
      </Button>
    </motion.span>
  ) : (
    <motion.span key="write" {...SWAP} className="inline-flex">
      <Link href="/report" className={`${LINK_BUTTON} btn-secondary text-text`} data-testid="report-due-write">
        Написать ›
        <HapticSwitch />
      </Link>
    </motion.span>
  );

  return (
    <MotionConfig reducedMotion="user">
      <div
        className={`relative flex flex-col py-2 pl-3 pr-2 transition-[border-color,box-shadow] duration-300 ${box.className}`}
        style={box.style}
        data-testid="report-due"
        data-state={look}
        data-one-tap={due.oneTap ? "" : undefined}
      >
        <div className="flex min-h-[48px] items-center gap-2">
          <Link
            href="/report"
            className="relative flex min-h-[48px] min-w-0 flex-1 items-center gap-3 rounded-[12px] transition-transform duration-[120ms] active:scale-[0.99]"
            data-testid="report-due-open"
          >
            <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] transition-colors duration-300" style={TILE[look]}>
              {due.submitted ? <ReportDoneIcon /> : <ReportIcon />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">{title}</span>
              <span className="mt-0.5 block truncate text-[13px] leading-[18px] text-muted">{sub}</span>
            </span>
            <HapticSwitch />
          </Link>
          <span className="flex shrink-0 items-center">
            <AnimatePresence initial={false} mode="popLayout">
              {side}
            </AnimatePresence>
          </span>
        </div>

        {/* the evening: the actions get a line of their own, the main one wide under the thumb */}
        <AnimatePresence initial={false}>
          {actionsLine ? (
            <motion.div
              key="actions"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1, transition: springs.object }}
              exit={{ height: 0, opacity: 0, transition: { duration: 0.16, ease: [0.4, 0, 1, 1] } }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 pb-0.5 pt-2">
                {due.oneTap || justSent ? (
                  <>
                    <Link href="/report" className={`${EDIT_LINK} px-3`} data-testid="report-due-edit">
                      {/* before the hand-in it opens the form to add words; after — to change them */}
                      {justSent || due.submitted ? "Изменить ›" : "Написать ›"}
                      <HapticSwitch />
                    </Link>
                    <span className="relative flex flex-1">
                      <AnimatePresence initial={false} mode="popLayout">
                        {justSent ? (
                          <motion.span key="done" {...SWAP} className={`${DONE_PILL} flex-1`} data-testid="report-due-sent">
                            <Icon name="check" size={16} />
                            Сдан
                          </motion.span>
                        ) : (
                          <motion.span key="send" {...SWAP} className="flex flex-1">
                            <Button block onClick={onSubmit} data-testid="report-due-send">
                              Сдать
                            </Button>
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </span>
                  </>
                ) : (
                  <Link href="/report" className={`${LINK_BUTTON} btn-primary flex-1 text-bg`} data-testid="report-due-write">
                    Написать отчёт ›
                    <HapticSwitch />
                  </Link>
                )}
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* the points rise from where «Сдать» was and melt away inside the row */}
        <div className="pointer-events-none absolute bottom-2 right-2 h-0 w-[160px]">
          <PointsPop pop={pop} />
        </div>
      </div>
    </MotionConfig>
  );
}
