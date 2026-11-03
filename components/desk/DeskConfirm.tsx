"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { ConfirmList } from "@/components/confirm/ConfirmList";
import { entitiesSummary } from "@/components/confirm/format";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { isTypingTarget } from "@/lib/desk/keys";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { lanesOf, toBriefTask, WORK_STATUSES } from "@/lib/pulse/board";
import { whyNothingToSend, useIngestStore, type IngestErrorCode } from "@/lib/store/ingest";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";

/** What went wrong, in the assistant's words (DESIGN §5) — the typed path's share of the overlay's table. */
const ERROR_LINE: Partial<Record<IngestErrorCode, string>> = {
  empty_transcript: "Не понял, повторить?",
  stt_failed: "Не расслышал. Аудио сохранил — повторить?",
  parse_failed: "Прочитал текст, но не разобрал",
  parse_refused: "Не берусь разобрать это",
  parse_empty: "Не нашёл здесь ни задач, ни объявлений",
  ai_timeout: "Долго думаю. Повторить?",
  rate_limited: "Слишком часто. Минуту подожду",
  upload_failed: "Не смог сохранить аудио — повторить?",
  network: "Нет связи. Попробую ещё раз",
};

/**
 * The assistant's answer to a question typed into the order line (D-154): the same deterministic
 * answerer as Пульс (`lib/pulse/answers.ts`, D-51 п.4) over the same board — «кто просрочил»,
 * «что у Ерлана» answered here instead of «ask the phone».
 */
function useDeskAnswer(question: string | null) {
  const me = useMe().data;
  const board = usePulseBoard(me, Boolean(question));
  const people = usePeople();
  const sent = useSentTasks(question ? me?.userId : undefined);
  const [now] = useState(() => new Date());
  return useMemo(() => {
    if (!question || !me || !board.data || !people.data || sent.isLoading) return null;
    const rows = board.data;
    const lanes = lanesOf(rows, now, me.userId);
    return answer({
      question,
      now,
      people: people.data.filter((p) => p.is_active && p.role !== "tv").map((p) => ({ id: p.id, fullName: p.full_name, aliases: p.aliases ?? [] })),
      open: rows.filter((t) => WORK_STATUSES.includes(t.status)).map((t) => ({ ...toBriefTask(t), status: t.status })),
      closed: (sent.data ?? [])
        .filter((t) => t.status === "done" || t.status === "declined" || t.status === "revoked")
        .map((t) => ({ id: t.id, title: t.title, deadline: t.deadline, assignee: t.assignee?.full_name ? shortName(t.assignee.full_name) : null, assigneeId: t.assignee_id, status: t.status, closedAt: t.closed_at })),
      overdue: lanes.overdue.map(toBriefTask),
      declined: lanes.declined.map((t) => ({ ...toBriefTask(t), reason: t.decline_reason })),
      questions: lanes.question.map(toBriefTask),
      review: lanes.review.map(toBriefTask),
    });
  }, [question, me, board.data, people.data, sent.isLoading, sent.data, now]);
}

/**
 * The parsed order in the desk's right-hand panel (D-153 §5): the same cards as the phone's
 * confirm screen (`ConfirmList` — the assignee and deadline sheets become dialogs here), why
 * nothing can go if so, «Отправить» and «Отменить»; «не разобрал» with the words to fix; a failure
 * with «Повторить». A draft left from the phone (D-92) shows here the same way.
 */
export function DeskConfirm() {
  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const transcript = useIngestStore((state) => state.transcript);
  const question = useIngestStore((state) => state.question);
  const error = useIngestStore((state) => state.error);
  const reset = useIngestStore((state) => state.reset);
  const retry = useIngestStore((state) => state.retry);
  const reparse = useIngestStore((state) => state.reparse);
  const startManual = useIngestStore((state) => state.startManual);
  const editEntity = useIngestStore((state) => state.editEntity);
  const pointsEnabled = usePointsEnabled().data === true;
  const { sendBatch, sendable, countable, sending } = useSendBatch();
  const [assigneeIndex, setAssigneeIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const reply = useDeskAnswer(stage === "question" ? question || transcript : null);

  // the whole order without the mouse (D-154): Ctrl/Cmd+Enter sends, 1–4 picks among the people
  // the parser was not sure about — the chips of the first card that asks «кому из них»
  const keys = useRef({ send: () => {}, pick: (n: number) => void n });
  useEffect(() => {
    keys.current.send = () => {
      if (stage === "confirm" && sendable > 0 && !sending) void sendBatch(false);
    };
    keys.current.pick = (n: number) => {
      const index = entities.findIndex((entity) => entity.assignee && entity.assignee.status !== "matched" && entity.assignee.candidates.length > 0);
      const candidate = index >= 0 ? entities[index].assignee?.candidates[n - 1] : undefined;
      if (!candidate) return;
      editEntity(index, {
        assignee_id: candidate.user_id,
        assignee_name: null,
        assignee: { status: "matched", user_id: candidate.user_id, candidates: [{ ...candidate, score: 1 }], flag: "ok" },
        blocked: undefined,
      });
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.code === "NumpadEnter")) {
        event.preventDefault();
        keys.current.send();
        return;
      }
      const digit = /^Digit([1-4])$/.exec(event.code);
      if (digit && !event.ctrlKey && !event.metaKey && !event.altKey && !isTypingTarget(event.target)) {
        event.preventDefault();
        keys.current.pick(Number(digit[1]));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (stage === "error") {
    return (
      <section className="flex flex-col gap-3 pr-8" data-testid="desk-confirm">
        <h2 className="font-display text-[17px] font-semibold leading-6">Не получилось</h2>
        <p className="text-[14px] leading-5">{error?.message || ERROR_LINE[error?.code ?? "unknown"] || "Что-то пошло не так — повторить?"}</p>
        {transcript ? <Quote text={transcript} /> : null}
        <div className="flex gap-2">
          <Button size="sm" onClick={() => void retry()}>
            Повторить
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            Закрыть
          </Button>
        </div>
      </section>
    );
  }

  if (stage === "question") {
    return (
      <section className="flex flex-col gap-3 pr-8" data-testid="desk-confirm">
        <h2 className="font-display text-[17px] font-semibold leading-6">{reply && !reply.understood ? "Не понял вопрос" : "Отвечаю"}</h2>
        <Quote text={question || transcript} />
        {reply ? (
          <div className="flex flex-col gap-1.5" data-testid="desk-answer">
            {reply.lines.map((line, index) => (
              <p key={index} className={`text-[14px] leading-5 ${index === 0 ? "font-semibold" : "text-text/90"}`}>
                {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[14px] leading-5 text-muted">Смотрю по задачам…</p>
        )}
        <p className="text-[12px] leading-4 text-muted">Поручение пишется так: «кому, что, к какому сроку».</p>
        <div>
          <Button size="sm" variant="secondary" onClick={reset}>
            Закрыть
          </Button>
        </div>
      </section>
    );
  }

  // nothing parsed out of the words: show them, let them be fixed or made a task by hand
  if (entities.length === 0) {
    const text = draft ?? transcript;
    return (
      <section className="flex flex-col gap-3 pr-8" data-testid="desk-confirm">
        <h2 className="font-display text-[17px] font-semibold leading-6">Не разобрал</h2>
        <p className="text-[14px] leading-5 text-muted">Не нашёл здесь ни задач, ни объявлений. Поправьте слова и разберу заново — или сделаю из них задачу.</p>
        <textarea
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          rows={3}
          className="field w-full px-3 py-2 text-[14px] leading-5"
          aria-label="Текст поручения"
        />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={!text.trim()}
            onClick={() => {
              setDraft(null);
              void reparse(text);
            }}
          >
            Разобрать заново
          </Button>
          <Button size="sm" variant="secondary" onClick={startManual}>
            Сделать задачей
          </Button>
          <Button size="sm" variant="ghost" onClick={reset}>
            Закрыть
          </Button>
        </div>
      </section>
    );
  }

  const why = whyNothingToSend(entities, pointsEnabled);
  return (
    <section className="flex flex-col gap-3" data-testid="desk-confirm">
      <div className="pr-8">
        <h2 className="font-display text-[17px] font-semibold leading-6">Понял так: {entitiesSummary(entities)}</h2>
        {transcript ? <Quote text={transcript} /> : null}
      </div>
      <ConfirmList assigneeIndex={assigneeIndex} onAssigneeIndex={setAssigneeIndex} />
      {why ? <p className="text-[14px] leading-5 text-warn">{why}</p> : null}
      <div className="sticky bottom-0 -mx-5 flex items-center gap-2 border-t border-border bg-surface px-5 pb-1 pt-3">
        <Button size="sm" disabled={sendable === 0} loading={sending} onClick={() => void sendBatch(false)} data-testid="desk-confirm-send">
          {sendable > 0 && sendable < countable ? `Отправить ${sendable} из ${countable}` : "Отправить"}
        </Button>
        <Button size="sm" variant="secondary" disabled={sending} onClick={reset} data-testid="desk-confirm-cancel">
          Отменить
        </Button>
        <span className="ml-auto flex items-center gap-1 text-[12px] text-muted">
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
          <span className="mr-1.5">отправить</span>
          {entities.some((entity) => entity.assignee && entity.assignee.status !== "matched" && entity.assignee.candidates.length > 0) ? (
            <>
              <Kbd>1</Kbd>–<Kbd>4</Kbd>
              <span className="mr-1.5">кто</span>
            </>
          ) : null}
          <Kbd>Esc</Kbd>
        </span>
      </div>
    </section>
  );
}

function Quote({ text }: { text: string }) {
  return <p className="mt-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] leading-[18px] text-muted">«{text}»</p>;
}
