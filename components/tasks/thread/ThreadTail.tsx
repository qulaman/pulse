"use client";

import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import { useTaskMessages } from "@/lib/tasks/queries";
import { wordText } from "@/lib/tasks/status-text";
import { CHAT_TYPES } from "@/lib/pulse/board";

const TAIL = 3;

/**
 * The last few replies of a thread, right on the card in «Сообщения»: the director
 * reads what was said without opening anything, and answers on the line below. The
 * query runs only for the card in front (`enabled`) — a panel of twenty threads must
 * not fetch twenty conversations.
 */
export function ThreadTail({ taskId, meId, enabled }: { taskId: string; meId: string; enabled: boolean }) {
  const messages = useTaskMessages(taskId, enabled);
  const chat = (messages.data ?? []).filter((message) => CHAT_TYPES.includes(message.type));
  if (!enabled || chat.length === 0) return null;
  const tail = chat.slice(-TAIL);

  return (
    <div className="mt-2 flex flex-col gap-1" data-testid="thread-tail">
      {tail.map((message) => {
        const mine = message.sender_id === meId;
        return (
          <p key={message.id} className="text-[13px] leading-[17px]">
            <span className="text-muted">
              {mine ? "Вы" : shortName(message.sender?.full_name) || "—"} · <span className="nums">{humanAqtobe(new Date(message.created_at))}</span>
            </span>{" "}
            <span className={mine ? "text-muted" : "text-text"}>{wordText(message)}</span>
          </p>
        );
      })}
    </div>
  );
}
