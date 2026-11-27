"use client";

import { CheckCheck, MessageSquareText } from "lucide-react";
import { useState } from "react";

import { useDeskParams } from "@/components/desk/DeskAddress";
import { toast } from "@/components/ui/Toast";
import { MESSAGE_KIND_WORD, plainWords, shortWhen, type HomeMessage } from "@/lib/desk/home";
import { shortName } from "@/lib/people/names";
import { useMarkRead } from "@/lib/tasks/mutations";
import type { Me } from "@/lib/tasks/queries";

import { Card, DayList, Ghost, Head, Person, Unfold, useArrivals } from "./kit";

/** How many stand before «…ещё N». */
const SHOWN = 5;

/**
 * «Сообщения» (D-164, D-196): the words people wrote in the director's tasks and he has not read —
 * the questions and the requests for time are «Ждут вас»'s on the left. A row opens the task's
 * panel with the thread; «Прочитал все» as on the phone (D-142). Nothing unread — the block is a
 * capsule of the quiet strip, the screen decides (TodayScreen).
 */
export function DayMessages({ me, messages, now, onOpenTask, index }: { me: Me; messages: readonly HomeMessage[]; now: Date; onOpenTask: (id: string) => void; index: number }) {
  const markRead = useMarkRead(me);
  const openId = useDeskParams().get("id");
  const [all, setAll] = useState(false);
  const fresh = useArrivals(messages.map((message) => message.task.id));
  const words = plainWords(messages);
  const shown = all ? messages : messages.slice(0, SHOWN);
  const more = messages.length - shown.length;

  const readAll = () => {
    for (const message of words) markRead.mutate({ taskId: message.task.id, companyId: me.companyId, seq: message.task.last_message?.seq ?? 0 });
    toast(`Прочитано: ${words.length}`);
  };

  return (
    <Card ink="violet" index={index} testId="home-messages">
      <Head icon={MessageSquareText} sign="messages" title="Сообщения" count={messages.length} corner={fresh.size > 0 ? "news" : "state"} key={fresh.size}>
        {words.length >= 2 ? (
          <Ghost icon={CheckCheck} onPress={readAll} title="Отметить прочитанными сообщения без вопроса и просьбы о сроке" testId="home-messages-read-all">
            Прочитал все · {words.length}
          </Ghost>
        ) : null}
      </Head>
      <DayList testId="home-messages-list">
        {shown.map((message) => {
          const who = shortName(message.who);
          return (
            <Unfold key={message.task.id}>
              <button
                type="button"
                onClick={() => onOpenTask(message.task.id)}
                aria-current={openId === message.task.id ? "true" : undefined}
                title={`«${message.task.title}»${who ? ` · ${who}` : ""}: ${message.text}`}
                className="day-row desk-focus"
                style={{ gridTemplateColumns: "24px minmax(0,1fr) auto", alignItems: "start" }}
                data-fresh={fresh.has(message.task.id) ? "" : undefined}
                data-testid="home-message"
                data-kind={message.kind}
              >
                <span className="pt-0.5">
                  <Person id={message.task.last_message?.sender_id ?? message.task.assignee_id} name={message.who || "?"} size={24} />
                </span>
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-[12px] leading-4 day-muted">
                    {who ? <span className="font-medium text-[var(--ink)]">{who}</span> : MESSAGE_KIND_WORD[message.kind]} · {message.task.title}
                  </span>
                  <span className="line-clamp-2 text-[13px] leading-5 [overflow-wrap:anywhere]">{message.text || "—"}</span>
                </span>
                <span className="day-when">{shortWhen(new Date(message.at), now)}</span>
              </button>
            </Unfold>
          );
        })}
        {more > 0 ? (
          <Unfold key="more">
            <button type="button" onClick={() => setAll(true)} className="day-row desk-focus day-muted" style={{ gridTemplateColumns: "1fr" }} data-testid="home-messages-more">
              …ещё {more}
            </button>
          </Unfold>
        ) : null}
      </DayList>
    </Card>
  );
}
