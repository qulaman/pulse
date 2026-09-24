"use client";

import { Button } from "@/components/ui/Button";
import { useAnswerVisit } from "@/lib/visits/mutations";
import type { Visit } from "@/lib/visits/queries";
import { unreadMessages, waitedSince } from "@/lib/visits/text";
import { firstNameOf } from "@/lib/text/normalize";

/**
 * Сообщение секретаря на Пульсе директора (D-116): те же слова, что сейчас во всю стену в
 * кабинете, и одна кнопка — «Понятно». Нажал — надпись уходит со стены, секретарь видит
 * «Директор прочитал». Карточка висит под лицом, пока не прочитано: как посетитель (D-96),
 * только ответ один.
 */
export function MessageAsk({ visits, now }: { visits: readonly Visit[]; now: Date }) {
  const answer = useAnswerVisit();
  const open = unreadMessages(visits);
  if (open.length === 0) return null;

  return (
    <div className="flex flex-col gap-2" data-testid="message-ask">
      {open.map((message) => {
        const busy = answer.isPending && answer.variables?.id === message.id;
        const who = firstNameOf(message.author?.full_name ?? "");
        return (
          <article
            key={message.id}
            className="card-in relative overflow-hidden rounded-[20px] border px-4 py-3"
            style={{
              borderColor: "color-mix(in srgb, var(--accent) 55%, var(--border))",
              background: "color-mix(in srgb, var(--accent) 8%, var(--surface))",
            }}
            data-testid="message-ask-card"
          >
            <p className="text-[13px] leading-4 text-muted">
              Сообщение · {waitedSince(message.created_at, now)}
              {who ? ` · ${who}` : ""}
            </p>
            <p className="mt-0.5 text-[17px] font-semibold leading-[22px] [overflow-wrap:anywhere]">{message.note?.trim()}</p>
            <div className="mt-3">
              <Button block disabled={busy} onClick={() => answer.mutate({ id: message.id, answer: "read" })}>
                Понятно
              </Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
