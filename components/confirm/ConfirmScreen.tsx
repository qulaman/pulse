"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { ConfirmList } from "@/components/confirm/ConfirmList";
import { SendBar } from "@/components/confirm/SendBar";
import { entitiesSummary } from "@/components/confirm/format";
import { useSendBatch } from "@/components/confirm/useSendBatch";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useIngestStore } from "@/lib/store/ingest";

export function ConfirmScreen({ sandbox = false }: { sandbox?: boolean }) {
  const entities = useIngestStore((state) => state.entities);
  const stage = useIngestStore((state) => state.stage);
  const reset = useIngestStore((state) => state.reset);
  const transcript = useIngestStore((state) => state.transcript);
  const reparse = useIngestStore((state) => state.reparse);
  const startManual = useIngestStore((state) => state.startManual);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [assigneeIndex, setAssigneeIndex] = useState<number | null>(null);

  const router = useRouter();
  const close = () => {
    reset();
    router.replace("/pulse");
  };

  // a draft reopened from another screen sends exactly the way the board does
  const { sendBatch, sendable: sendableCount, countable } = useSendBatch(() => router.replace("/pulse"));

  // Nothing parsed out of a real phrase: the words are shown and there is always a way out —
  // fix the text and parse again, make the words a task by hand, or close.
  if (entities.length === 0 && transcript.trim() && stage !== "parsing") {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <div className="flex items-center gap-3">
          <Mascot state="thinking" size={44} />
          <h1 className="text-[24px] font-bold leading-[30px]">Не разобрал</h1>
        </div>
        <p className="mt-4 text-[13px] leading-4 text-muted">Услышал так:</p>
        <p className="mt-1 rounded-[12px] bg-surface-2 px-3 py-2 text-[16px] leading-[22px]">«{transcript}»</p>
        <p className="mt-4 text-[16px] leading-[22px] text-muted">
          Не нашёл здесь ни задач, ни объявлений. Можно поправить слова и разобрать заново, или сделать из них задачу.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button
            block
            onClick={() => {
              setDraft(transcript);
              setEditing(true);
            }}
          >
            Исправить текст
          </Button>
          <Button block variant="secondary" onClick={startManual}>
            Сделать задачей
          </Button>
          <Button block variant="ghost" onClick={close}>
            Закрыть
          </Button>
        </div>

        <Sheet open={editing} onClose={() => setEditing(false)} title="Исправить текст">
          <textarea
            className="w-full field px-3 py-3 text-[16px] leading-[22px] outline-none focus:border-accent"
            rows={4}
            data-autofocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="mt-3">
            <Button
              block
              disabled={!draft.trim()}
              onClick={() => {
                setEditing(false);
                void reparse(draft);
              }}
            >
              Разобрать заново
            </Button>
          </div>
        </Sheet>
      </main>
    );
  }

  if (entities.length === 0) {
    return (
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
        <h1 className="text-[24px] font-bold leading-[30px]">Пока нечего подтверждать</h1>
        <p className="mt-2 text-[16px] leading-[22px] text-muted">
          Зажми кнопку на экране Пульса и скажи, что нужно сделать.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.replace("/pulse")}>К Пульсу</Button>
        </div>
      </main>
    );
  }

  const handleSend = async (forceNow: boolean) => {
    if (sandbox) {
      toast("Песочница: отправка отключена");
      return;
    }
    await sendBatch(forceNow);
  };

  const firstBlocked = entities.findIndex((entity) => entity.blocked === "assignee_unmatched");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-8 pt-5">
        <div className="flex items-center gap-3">
          <Mascot state={sendableCount === countable && countable > 0 ? "happy" : "thinking"} size={44} />
          <h1 className="min-w-0 flex-1 text-[24px] font-bold leading-[30px]">Понял так: {entitiesSummary(entities)}</h1>
          <button
            type="button"
            onClick={close}
            aria-label="Закрыть"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border text-[20px] leading-none text-muted transition-transform duration-[120ms] active:scale-[0.96]"
          >
            ×
          </button>
        </div>

        <div className="mt-4">
          <ConfirmList assigneeIndex={assigneeIndex} onAssigneeIndex={setAssigneeIndex} />
        </div>
      </main>

      <SendBar
        sendable={sendableCount}
        total={countable}
        sending={stage === "sending"}
        onSend={(forceNow) => void handleSend(forceNow)}
        onReset={close}
        onFixFirst={firstBlocked >= 0 ? () => setAssigneeIndex(firstBlocked) : undefined}
      />
    </div>
  );
}
