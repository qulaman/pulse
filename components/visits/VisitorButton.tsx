"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { useAnnounceVisit } from "@/lib/visits/mutations";
import type { Visit, VisitKind } from "@/lib/visits/queries";
import { recentNotes } from "@/lib/visits/text";

/**
 * The secretary's two buttons on the home screen — one sheet.
 *
 * «Посетитель» (D-96): a person came to the desk — the secretary presses the button, writes who it
 * is (or not), and the director sees «К вам посетитель» on the office wall and on the phone.
 *
 * «Сообщение» (D-116): the secretary's words — across the whole office wall and as a push to the
 * director, the answer is «Понятно». No words, no message, so the send button waits for text.
 *
 * Recent words as chips: the same supplier comes more than once, the same «Звонил Ахметов» is
 * written more than once, there is no point typing it again.
 */

const MAX = 120;

const COPY: Record<
  VisitKind,
  { button: string; title: string; hint: string; placeholder: string; send: string; testid: string }
> = {
  visitor: {
    button: "Посетитель",
    title: "Посетитель к директору",
    hint: "На экране в кабинете появится «К вам посетитель», директору придёт пуш.",
    placeholder: "Кто пришёл — необязательно",
    send: "Сообщить директору",
    testid: "visitor",
  },
  message: {
    button: "Сообщение",
    title: "Сообщение на экран",
    hint: "Текст появится во всю стену в кабинете директора и придёт пушем. Если в кабинете гость — на стене только «Сообщение от секретаря».",
    placeholder: "Например: звонил Ахметов, просит перезвонить",
    send: "Показать директору",
    testid: "message",
  },
};

export function VisitorButton({ visits }: { visits: readonly Visit[] }) {
  return <AnnounceButton kind="visitor" visits={visits} />;
}

export function MessageButton({ visits }: { visits: readonly Visit[] }) {
  return <AnnounceButton kind="message" visits={visits} />;
}

function AnnounceButton({ kind, visits }: { kind: VisitKind; visits: readonly Visit[] }) {
  const copy = COPY[kind];
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  // the idempotency key is minted when the sheet opens: a double tap on «Сообщить» is one visit
  const [requestId, setRequestId] = useState<string | null>(null);
  const announce = useAnnounceVisit(kind);
  const recent = recentNotes(visits, kind);
  const empty = kind === "message" && note.trim() === "";

  const start = () => {
    setNote("");
    setRequestId(crypto.randomUUID());
    setOpen(true);
  };
  const send = (text: string) => {
    if (!requestId || announce.isPending || empty) return;
    announce.mutate(
      { note: text, id: requestId },
      {
        onSuccess: () => setOpen(false),
      },
    );
  };

  const field =
    "w-full rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] outline-none focus:border-accent";

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="card-in inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface-2 px-4 font-display text-[15px] font-semibold leading-5 text-text transition-transform duration-[120ms] active:scale-[0.97]"
        data-testid={`${copy.testid}-button`}
      >
        {kind === "message" ? <BubbleIcon /> : <DoorIcon />}
        {copy.button}
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title={copy.title}>
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(note);
          }}
        >
          <p className="text-[14px] leading-5 text-muted">{copy.hint}</p>
          {kind === "message" ? (
            <div className="relative">
              <textarea
                value={note}
                onChange={(event) => setNote(event.target.value.slice(0, MAX))}
                placeholder={copy.placeholder}
                maxLength={MAX}
                rows={3}
                className={`${field} resize-none`}
                data-testid={`${copy.testid}-note`}
              />
              {note.length > MAX - 30 ? (
                <span className="nums pointer-events-none absolute bottom-2 right-3 text-[12px] leading-4 text-muted">
                  {note.length}/{MAX}
                </span>
              ) : null}
            </div>
          ) : (
            <input
              value={note}
              onChange={(event) => setNote(event.target.value.slice(0, MAX))}
              placeholder={copy.placeholder}
              maxLength={MAX}
              enterKeyHint="send"
              className={field}
              data-testid={`${copy.testid}-note`}
            />
          )}
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recent.map((text) => (
                <Chip key={text} onClick={() => setNote(text)}>
                  {text}
                </Chip>
              ))}
            </div>
          ) : null}
          <Button type="submit" block disabled={empty} loading={announce.isPending} data-testid={`${copy.testid}-send`}>
            {copy.send}
          </Button>
        </form>
      </Sheet>
    </>
  );
}

function DoorIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 17.5h12" />
      <path d="M6 17.5V3.5h8v14" />
      <circle cx="11.6" cy="10.5" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function BubbleIcon() {
  return (
    <svg viewBox="0 0 20 20" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3.5 5.5a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H9.5l-3.5 3v-3h-.5a2 2 0 0 1-2-2z" />
    </svg>
  );
}
