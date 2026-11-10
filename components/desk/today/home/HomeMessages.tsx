"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { When } from "@/components/desk/ui/When";
import { toast } from "@/components/ui/Toast";
import { MESSAGE_KIND_WORD, messagesOf, plainWords, shortWhen, type HomeMessage, type MessageKind } from "@/lib/desk/home";
import { loadStateOf } from "@/lib/desk/tasks";
import { shortName } from "@/lib/people/names";
import { useNow } from "@/lib/pulse/queries";
import { useMarkRead } from "@/lib/tasks/mutations";
import { usePulseBoard, type Me } from "@/lib/tasks/queries";

import { Aside, BlockNote, DAY_ROW, HeadMove, Quiet, RowsBone } from "./parts";

/** How many stand before «…ещё N». */
const SHOWN = 5;

/** The ink of a message's kind (D-158): a question is violet, a request for time is the director's move, a word is print. */
const KIND_INK: Record<MessageKind, string> = {
  question: "var(--violet, var(--accent))",
  request: "var(--accent)",
  word: "var(--text-muted)",
};

/**
 * «Сообщения» on the desk's home (D-164): the phone's «Сообщения» ball — what people wrote in the
 * director's tasks and he has not read, questions first; a row opens the task's panel with the
 * thread. Contract frozen with TodayScreen: self-fetching, renders its own section.
 *
 * The same board as the phone (`usePulseBoard`) and the same rule (`hasMessage`); on the desk the
 * open questions and requests for time already stand in «Ждут вас» beside it, with their answers at
 * hand — here only the words, so nothing is said twice on one sheet. «Прочитал все» as on the
 * phone (D-142).
 */
export function HomeMessages({ me, onOpenTask }: { me: Me; onOpenTask: (id: string) => void }) {
  const board = usePulseBoard(me);
  const now = useNow(60_000);
  const markRead = useMarkRead(me);
  const openId = useSearchParams().get("id");
  const [all, setAll] = useState(false);
  const load = loadStateOf(board);
  // questions and requests are «Ждут вас»'s: one place for each thing on the home
  const messages = useMemo(() => messagesOf(board.data ?? [], me.userId, now).filter((message) => message.kind === "word"), [board.data, me.userId, now]);
  const words = plainWords(messages);
  const shown = all ? messages : messages.slice(0, SHOWN);
  const more = messages.length - shown.length;

  const readAll = () => {
    for (const message of words) markRead.mutate({ taskId: message.task.id, companyId: me.companyId, seq: message.task.last_message?.seq ?? 0 });
    toast(`Прочитано: ${words.length}`);
  };

  return (
    <Aside testId="home-messages">
      <SectionLabel
        count={messages.length}
        action={
          words.length >= 2 ? (
            <HeadMove onPress={readAll} title="Отметить прочитанными сообщения без вопроса и просьбы о сроке" testId="home-messages-read-all">
              Прочитал все · {words.length}
            </HeadMove>
          ) : null
        }
      >
        Сообщения
      </SectionLabel>
      <BlockNote state={load} failed="Сообщения не загрузились" now={now} onRetry={() => void board.refetch()} />
      {load.kind === "loading" ? (
        <RowsBone rows={2} height={50} />
      ) : load.kind === "failed" ? null : messages.length === 0 ? (
        <div className="desk-list">
          <Quiet testId="home-messages-empty">Непрочитанных слов в задачах нет — вопросы и просьбы о сроке стоят в «Ждут вас»</Quiet>
        </div>
      ) : (
        <ul className="desk-list" data-testid="home-messages-list">
          {shown.map((message) => (
            <li key={message.task.id}>
              <MessageRow message={message} now={now} chosen={openId === message.task.id} onOpen={() => onOpenTask(message.task.id)} />
            </li>
          ))}
          {more > 0 ? (
            <li>
              <button type="button" onClick={() => setAll(true)} className="desk-row desk-focus flex w-full items-center text-left text-[13px] leading-4 text-muted hover:text-text" data-testid="home-messages-more">
                …ещё {more}
              </button>
            </li>
          ) : null}
        </ul>
      )}
    </Aside>
  );
}

/** One message: when in the margin; its kind, who and the task over the words themselves. */
function MessageRow({ message, now, chosen, onOpen }: { message: HomeMessage; now: Date; chosen: boolean; onOpen: () => void }) {
  const who = shortName(message.who);
  const title = message.task.title;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={chosen ? "true" : undefined}
      title={`«${title}»${who ? ` · ${who}` : ""}: ${message.text}`}
      className={`desk-row desk-focus ${DAY_ROW} w-full text-left`}
      data-testid="home-message"
      data-kind={message.kind}
    >
      <When className="text-muted">{shortWhen(new Date(message.at), now)}</When>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[12px] leading-4 text-muted">
          <span className="font-medium" style={{ color: KIND_INK[message.kind] }}>
            {MESSAGE_KIND_WORD[message.kind]}
          </span>
          {who ? ` · ${who}` : ""} · {title}
        </span>
        <span className="line-clamp-2 text-[14px] leading-5 text-text [overflow-wrap:anywhere]">{message.text || "—"}</span>
      </span>
    </button>
  );
}
