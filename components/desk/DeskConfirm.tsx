"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

import { entitiesSummary } from "@/components/confirm/format";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { EntityEditor, type EditorContext } from "@/components/desk/confirm/EntityEditor";
import { hasAssignee, chosenId, mainField } from "@/components/desk/confirm/kinds";
import type { PickPerson } from "@/components/desk/confirm/PersonField";
import { PanelHeader } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { useRememberOffer } from "@/components/dictionary/useRememberOffer";
import { Button } from "@/components/ui/Button";
import { COMMAND_FIELD_ID, isTypingTarget } from "@/lib/desk/keys";
import { shortName } from "@/lib/people/names";
import { usePeople } from "@/lib/people/queries";
import { useRoster } from "@/lib/people/roster";
import { useDeliveryWindow, usePointsEnabled } from "@/lib/points/queries";
import { answer } from "@/lib/pulse/answers";
import { lanesOf, toBriefTask, WORK_STATUSES } from "@/lib/pulse/board";
import { isSendable, whyNothingToSend, useIngestStore, type IngestErrorCode } from "@/lib/store/ingest";
import { useMe, usePulseBoard, useSentTasks } from "@/lib/tasks/queries";
import { isWithinDeliveryWindow, WINDOW_OPEN_HOUR } from "@/lib/voice/quietHours";

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

/** Failures after which the words can still become a task by hand. */
const BY_HAND: ReadonlySet<IngestErrorCode> = new Set(["parse_failed", "parse_refused", "parse_empty", "ai_timeout", "rate_limited", "unknown"]);

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

const noStore = () => () => {};

/** Outside the company's delivery window the batch waits for the morning (D-38); read after hydration. */
function useQuietHours(): { quiet: boolean; opensAt: string } {
  const hydrated = useSyncExternalStore(noStore, () => true, () => false);
  const window = useDeliveryWindow().data;
  return { quiet: hydrated && !isWithinDeliveryWindow(new Date(), window), opensAt: window?.from ?? `0${WINDOW_OPEN_HOUR}:00` };
}

/**
 * The parsed order in the desk's right-hand panel (D-153 §5, D-154 wave 3): not the phone's cards
 * but an editor — every entity a compact form whose fields are reached by Tab: «Кому» picks from
 * the people with ↑/↓ and Enter, «Что» is edited in place, «Срок» takes «завтра 15» or a preset.
 * Ctrl+Enter sends, Ctrl+Shift+Enter sends now in quiet hours, 1–4 pick among namesakes, Esc
 * cancels. Everything edits the ingest store (`editEntity`, `removeEntity`) and goes by
 * `useSendBatch` — the phone's own path. «Не разобрал» keeps the words to fix; a failure offers
 * «Повторить» and, where it helps, the words as a task by hand. A draft left from the phone
 * (D-92) opens here the same way.
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
  const removeEntity = useIngestStore((state) => state.removeEntity);
  const pointsEnabled = usePointsEnabled().data === true;
  const { sendBatch, sendable, countable, sending, nameOf } = useSendBatch();
  const { quiet, opensAt } = useQuietHours();
  const roster = useRoster();
  const myId = useMe().data?.userId;
  const offerToRemember = useRememberOffer();
  const [draft, setDraft] = useState<string | null>(null);
  const reply = useDeskAnswer(stage === "question" ? question || transcript : null);
  const section = useRef<HTMLElement>(null);

  const editing = stage === "confirm" || stage === "sending";
  const people = useMemo<PickPerson[]>(
    () => (roster.data ?? []).filter((person) => person.id !== myId).map((person) => ({ id: person.id, full_name: person.full_name, position: person.position })),
    [roster.data, myId],
  );
  const digitsFor = entities.findIndex((entity) => hasAssignee(entity) && entity.assignee?.status === "ambiguous" && (entity.assignee?.candidates.length ?? 0) > 0);
  // a sendable entity with its words wiped would go out empty: the button waits for them
  const blank = entities.some((entity) => isSendable(entity, pointsEnabled) && entity.kind !== "points" && !mainField(entity).value.trim());
  const canSend = editing && sendable > 0 && !blank && !sending;

  useShortcuts(
    "Подтверждение поручения",
    editing && entities.length > 0
      ? [
          { keys: ["Ctrl Enter"], label: "Отправить" },
          ...(quiet ? [{ keys: ["Ctrl Shift Enter"], label: "Отправить сейчас, не дожидаясь утра" }] : []),
          { keys: ["Tab"], label: "Следующее поле" },
          { keys: ["↑", "↓", "Enter"], label: "Выбрать человека или срок в списке" },
          { keys: ["1–4"], label: "Кому из них — когда имя подходит нескольким" },
          { keys: ["Esc"], label: "Закрыть список; ещё раз — отменить поручение" },
        ]
      : [],
  );

  const pickAssignee = (index: number, person: PickPerson) => {
    // a name the AI could not place, now placed by hand: offer to remember it (D-111)
    const before = useIngestStore.getState().entities[index];
    if (before) offerToRemember(before, { user_id: person.id, full_name: person.full_name });
    editEntity(index, {
      assignee_id: person.id,
      assignee_name: null,
      assignee: { status: "matched", user_id: person.id, candidates: [{ user_id: person.id, full_name: person.full_name, score: 1 }], flag: "ok" },
      blocked: undefined,
    });
  };

  // the whole order without the mouse (D-154): Ctrl/Cmd+Enter sends (with Shift — now, in quiet
  // hours), 1–4 pick among the namesakes of the first entity that asks «кому из них»
  const keys = useRef({ send: (now: boolean) => void now, pick: (n: number) => void n });
  useEffect(() => {
    keys.current.send = (now: boolean) => {
      if (canSend) void sendBatch(now && quiet);
    };
    keys.current.pick = (n: number) => {
      const candidate = digitsFor >= 0 ? entities[digitsFor].assignee?.candidates[n - 1] : undefined;
      if (candidate) pickAssignee(digitsFor, { id: candidate.user_id, full_name: candidate.full_name });
    };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if ((event.ctrlKey || event.metaKey) && (event.key === "Enter" || event.code === "NumpadEnter")) {
        event.preventDefault();
        keys.current.send(event.shiftKey);
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

  // the parse has landed: the caret goes where the order needs a hand — a «Кому?» left open, or
  // «Отправить» (Enter sends) — unless the director has already moved elsewhere
  const arrived = useRef(false);
  useEffect(() => {
    if (!editing || entities.length === 0) {
      arrived.current = false;
      return;
    }
    if (arrived.current) return;
    arrived.current = true;
    const from = document.activeElement;
    if (from && from !== document.body && from.id !== COMMAND_FIELD_ID) return;
    const root = section.current;
    const target = root?.querySelector<HTMLElement>('[data-tone="danger"] input, [data-tone="warn"] input') ?? root?.querySelector<HTMLElement>('[data-testid="desk-confirm-send"]:not([disabled])');
    target?.focus({ preventScroll: true });
  });

  if (stage === "error") {
    const byHand = Boolean(transcript.trim()) && BY_HAND.has(error?.code ?? "unknown");
    return (
      <section className="flex flex-col gap-3" data-testid="desk-confirm" data-state="error">
        <PanelHeader>
          <h2 className="desk-task-title text-[21px] leading-[26px] text-danger">Не получилось</h2>
          <p className="mt-1 text-[14px] leading-5" data-testid="desk-confirm-error">
            {error?.message || ERROR_LINE[error?.code ?? "unknown"] || "Что-то пошло не так — повторить?"}
          </p>
        </PanelHeader>
        {transcript ? <Quote text={transcript} /> : null}
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void retry()} data-testid="desk-confirm-retry">
            Повторить
          </Button>
          {byHand ? (
            <Button size="sm" variant="secondary" onClick={startManual}>
              Сделать задачей
            </Button>
          ) : null}
          <Button size="sm" variant="ghost" onClick={reset} data-testid="desk-confirm-cancel">
            Закрыть
          </Button>
        </div>
        {byHand ? <p className="text-[12px] leading-4 text-muted">«Сделать задачей» — весь текст станет одной задачей, исполнителя и срок поставите здесь.</p> : null}
      </section>
    );
  }

  if (stage === "question") {
    return (
      <section className="flex flex-col gap-3" data-testid="desk-confirm" data-state="question">
        <PanelHeader>
          <h2 className="desk-task-title text-[21px] leading-[26px]">{reply && !reply.understood ? "Не понял вопрос" : "Отвечаю"}</h2>
        </PanelHeader>
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
          <Button size="sm" variant="secondary" onClick={reset} data-testid="desk-confirm-cancel">
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
      <section className="flex flex-col gap-3" data-testid="desk-confirm" data-state="empty">
        <PanelHeader>
          <h2 className="desk-task-title text-[21px] leading-[26px]">Не разобрал</h2>
          <p className="mt-1 text-[14px] leading-5 text-muted">Не нашёл здесь ни задач, ни объявлений. Поправьте слова и разберу заново — или сделаю из них задачу.</p>
        </PanelHeader>
        <textarea
          value={text}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && text.trim()) {
              event.preventDefault();
              event.stopPropagation();
              setDraft(null);
              void reparse(text);
            }
          }}
          rows={3}
          className="desk-input w-full py-2 text-[14px] leading-5 outline-none"
          aria-label="Текст поручения"
          autoFocus
        />
        <div className="flex flex-wrap items-center gap-2">
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
          <Button size="sm" variant="ghost" onClick={reset} data-testid="desk-confirm-cancel">
            Закрыть
          </Button>
          <span className="ml-auto flex items-center gap-1 text-[12px] text-muted">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
            разобрать
          </span>
        </div>
      </section>
    );
  }

  const why = whyNothingToSend(entities, pointsEnabled);
  const ctx: EditorContext = { people, nameOf, pointsEnabled, digitsFor: digitsFor >= 0 ? digitsFor : null, onPickAssignee: pickAssignee };
  const waiting = entities.filter((entity) => hasAssignee(entity) && !chosenId(entity)).length;
  const label = sendable > 0 && sendable < countable ? `Отправить ${sendable} из ${countable}` : "Отправить";

  return (
    <section ref={section} className="flex min-h-full flex-col" data-testid="desk-confirm" data-state="confirm">
      <PanelHeader>
        <h2 className="desk-task-title text-[19px] leading-6">Понял так: {entitiesSummary(entities)}</h2>
        {transcript ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-[18px] text-muted" title={transcript}>
            «{transcript}»
          </p>
        ) : null}
      </PanelHeader>

      <div className="divide-y divide-border border-b border-border" data-testid="desk-entities">
        {entities.map((entity, index) => (
          <EntityEditor key={`${entity.kind}-${index}`} entity={entity} index={index} ctx={ctx} onPatch={(patch) => editEntity(index, patch)} onRemove={() => removeEntity(index)} />
        ))}
      </div>

      {why || blank || waiting > 0 ? (
        <p className="mt-2 text-[13px] leading-5 text-warn" data-testid="desk-confirm-why">
          {why || (blank ? "Пустой текст не уйдёт — допишите или уберите строку." : `Ждёт исполнителя: ${waiting}. Остальное уйдёт.`)}
        </p>
      ) : null}

      <div className="flex-1" />
      <footer className="sticky -bottom-6 -mx-5 -mb-6 mt-4 border-t border-text bg-surface px-5 pb-4 pt-3">
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!canSend} loading={sending} onClick={() => void sendBatch(false)} data-testid="desk-confirm-send" className="whitespace-nowrap">
            {label}
          </Button>
          <Button size="sm" variant="secondary" disabled={sending} onClick={reset} data-testid="desk-confirm-cancel">
            Отменить
          </Button>
          <span className="ml-auto flex shrink-0 items-center gap-1 text-[12px] leading-4 text-muted">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </span>
        </div>
        {quiet ? (
          <p className="mt-2 flex flex-wrap items-center gap-x-1.5 text-[12px] leading-4 text-muted">
            Отправлю утром в {opensAt} ·
            <button type="button" className="underline decoration-accent/50 underline-offset-2 hover:text-text" disabled={!canSend} onClick={() => void sendBatch(true)}>
              отправить сейчас
            </button>
            <Kbd>Ctrl Shift Enter</Kbd>
          </p>
        ) : null}
      </footer>
    </section>
  );
}

function Quote({ text }: { text: string }): ReactNode {
  return <p className="-ml-3 border-l-2 border-border pl-2.5 text-[13px] leading-5 text-muted">«{text}»</p>;
}
