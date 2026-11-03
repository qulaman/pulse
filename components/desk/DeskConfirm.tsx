"use client";

import { useState } from "react";

import { ConfirmList } from "@/components/confirm/ConfirmList";
import { entitiesSummary } from "@/components/confirm/format";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Button } from "@/components/ui/Button";
import { usePointsEnabled } from "@/lib/points/queries";
import { whyNothingToSend, useIngestStore, type IngestErrorCode } from "@/lib/store/ingest";

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
  const pointsEnabled = usePointsEnabled().data === true;
  const { sendBatch, sendable, countable, sending } = useSendBatch();
  const [assigneeIndex, setAssigneeIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<string | null>(null);

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
        <h2 className="font-display text-[17px] font-semibold leading-6">Это вопрос, а не поручение</h2>
        <Quote text={question || transcript} />
        <p className="text-[14px] leading-5 text-muted">На вопросы о делах отвечаю на Пульсе, в телефоне. Поручение напишите так: «кому, что, к какому сроку».</p>
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
          <Kbd>Esc</Kbd> — отменить
        </span>
      </div>
    </section>
  );
}

function Quote({ text }: { text: string }) {
  return <p className="mt-1 rounded-[10px] bg-surface-2 px-3 py-2 text-[13px] leading-[18px] text-muted">«{text}»</p>;
}
