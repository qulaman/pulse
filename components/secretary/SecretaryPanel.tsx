"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { askSecretary, cancelErrand, usePendingErrands } from "@/lib/errands/pending";
import { useErrandActions } from "@/lib/errands/mutations";
import { isActive, useErrandReceipt, waitedFor, type Errand } from "@/lib/errands/queries";
import { receiptLine } from "@/lib/tasks/receipts";
import type { SecretaryAction } from "@/lib/settings";
import { firstNameOf } from "@/lib/text/normalize";

/** Долгий тап — второй слой: примечание к просьбе («без сахара»). */
const HOLD_MS = 500;

/**
 * Панель шарика «Секретарь» у директора (D-79): сетка крупных кнопок каталога — один
 * тап и всё. Строка появляется сразу, пять секунд висит тост «Отменить», и только
 * потом просьба уходит в базу: пуш летит сразу после вставки, отменять его было бы
 * поздно. Под кнопками — что сейчас в работе, с квитанцией «увидел / не открывал».
 */
export function SecretaryPanel({
  actions,
  errands,
  now,
  onRefresh,
}: {
  actions: readonly SecretaryAction[];
  errands: readonly Errand[];
  now: Date;
  onRefresh: () => void;
}) {
  const pending = usePendingErrands((state) => state.pending);
  const [noteFor, setNoteFor] = useState<SecretaryAction | null>(null);
  const [note, setNote] = useState("");
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const held = useRef(false);

  const active = errands.filter(isActive);

  const ask = (action: SecretaryAction, text: string | null) => {
    askSecretary(action, text, onRefresh);
  };

  const startHold = (action: SecretaryAction) => {
    held.current = false;
    holdTimer.current = setTimeout(() => {
      held.current = true;
      setNote("");
      setNoteFor(action);
    }, HOLD_MS);
  };
  const endHold = (action: SecretaryAction) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    holdTimer.current = null;
    if (held.current) return; // the long press opened the note sheet — no errand yet
    ask(action, null);
  };

  if (actions.length === 0) {
    return (
      <p className="py-4 text-center text-[16px] leading-[22px] text-muted">
        Каталог пуст. Добавь кнопки в настройках.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="secretary-panel">
      <div className="grid grid-cols-2 gap-3">
        {actions.map((action) => (
          <button
            key={action.code}
            type="button"
            data-testid="errand-button"
            data-code={action.code}
            onPointerDown={() => startHold(action)}
            onPointerUp={() => endHold(action)}
            onPointerLeave={() => {
              if (holdTimer.current) clearTimeout(holdTimer.current);
              holdTimer.current = null;
            }}
            onContextMenu={(e) => e.preventDefault()}
            className="flex min-h-[92px] flex-col items-center justify-center gap-1 card px-3 py-4 text-center active:scale-[0.98]"
            style={{ touchAction: "manipulation", WebkitTapHighlightColor: "transparent" }}
          >
            <span aria-hidden className="text-[28px] leading-none">
              {action.icon || "•"}
            </span>
            <span className="text-[16px] font-semibold leading-[22px]">{action.label}</span>
          </button>
        ))}
      </div>
      <p className="px-1 text-[13px] leading-4 text-muted">Долгий тап — добавить примечание</p>

      {pending.map((row) => (
        <div key={row.id} className="card-in flex items-center justify-between gap-3 card px-4 py-3">
          <span className="text-[15px] leading-5">
            {row.label} · <span className="text-muted">отправляю…</span>
          </span>
          <button type="button" className="min-h-[44px] text-[14px] text-accent" onClick={() => cancelErrand(row.id)}>
            Отменить
          </button>
        </div>
      ))}

      {active.map((errand) => (
        <ActiveErrand key={errand.id} errand={errand} now={now} />
      ))}

      <Sheet open={Boolean(noteFor)} onClose={() => setNoteFor(null)} title={noteFor?.label ?? ""}>
        <input
          data-autofocus
          className="min-h-[48px] w-full field px-3 text-[16px] leading-[22px] outline-none focus:border-accent"
          placeholder="без сахара, в переговорную"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="mt-3">
          <Button
            block
            onClick={() => {
              if (noteFor) ask(noteFor, note.trim() || null);
              setNoteFor(null);
            }}
          >
            Отправить
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

/** Одна живая заявка: что просили, кто взял, сколько ждёт и видел ли секретарь пуш. */
function ActiveErrand({ errand, now }: { errand: Errand; now: Date }) {
  const transition = useErrandActions();
  // квитанция нужна, только пока никто не взялся: «принято» честнее любой галочки
  const receipt = useErrandReceipt(errand.id, errand.status === "sent");
  const line = errand.status === "sent" ? receiptLine(receipt.data, now) : null;
  const who = firstNameOf(errand.claimed?.full_name ?? "");

  return (
    <div className="card-in card px-4 py-3" data-testid="errand-active" data-status={errand.status}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[15px] leading-5">
          {errand.label}
          {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
          {errand.status === "accepted" ? (
            // без рода: «Принято · Айгуль», а не «приняла» (docs/DESIGN.md)
            <span style={{ color: "var(--ok)" }}> · Принято{who ? ` · ${who}` : ""}</span>
          ) : null}
          <span className="text-muted"> · {waitedFor(errand, now)}</span>
        </span>
        <button
          type="button"
          className="min-h-[44px] shrink-0 text-[14px] text-muted"
          disabled={transition.isPending}
          onClick={() => transition.mutate({ id: errand.id, to: "cancelled" })}
        >
          Отменить
        </button>
      </div>
      {line ? (
        <p className="mt-1 text-[13px] leading-4" style={{ color: line.tone === "warn" ? "var(--warn)" : "var(--text-muted)" }}>
          {line.text}
        </p>
      ) : null}
    </div>
  );
}
