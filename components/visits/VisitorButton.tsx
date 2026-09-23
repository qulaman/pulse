"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { useAnnounceVisit } from "@/lib/visits/mutations";
import type { Visit } from "@/lib/visits/queries";
import { recentNotes } from "@/lib/visits/text";

/**
 * «Посетитель» на главном экране секретаря (D-96): человек подошёл к столу — секретарь
 * жмёт кнопку, пишет, кто это (можно и не писать), и директор видит «К вам посетитель» на
 * стене в кабинете и в телефоне. Недавние посетители — чипами: тот же поставщик приходит
 * не раз, печатать второй раз незачем.
 */
export function VisitorButton({ visits }: { visits: readonly Visit[] }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  // the idempotency key is minted when the sheet opens: a double tap on «Сообщить» is one visit
  const [requestId, setRequestId] = useState<string | null>(null);
  const announce = useAnnounceVisit();
  const recent = recentNotes(visits);

  const start = () => {
    setNote("");
    setRequestId(crypto.randomUUID());
    setOpen(true);
  };
  const send = (text: string) => {
    if (!requestId || announce.isPending) return;
    announce.mutate(
      { note: text, id: requestId },
      {
        onSuccess: () => setOpen(false),
      },
    );
  };

  return (
    <>
      <button
        type="button"
        onClick={start}
        className="card-in inline-flex min-h-[44px] items-center gap-2 rounded-full border border-border bg-surface-2 px-4 font-display text-[15px] font-semibold leading-5 text-text transition-transform duration-[120ms] active:scale-[0.97]"
        data-testid="visitor-button"
      >
        <DoorIcon />
        Посетитель
      </button>

      <Sheet open={open} onClose={() => setOpen(false)} title="Посетитель к директору">
        <form
          className="flex flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            send(note);
          }}
        >
          <p className="text-[14px] leading-5 text-muted">На экране в кабинете появится «К вам посетитель», директору придёт пуш.</p>
          <input
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, 120))}
            placeholder="Кто пришёл — необязательно"
            maxLength={120}
            enterKeyHint="send"
            className="w-full rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] outline-none focus:border-accent"
            data-testid="visitor-note"
          />
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recent.map((text) => (
                <Chip key={text} onClick={() => setNote(text)}>
                  {text}
                </Chip>
              ))}
            </div>
          ) : null}
          <Button type="submit" block loading={announce.isPending} data-testid="visitor-send">
            Сообщить директору
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
