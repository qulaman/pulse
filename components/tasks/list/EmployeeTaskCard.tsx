"use client";

import { ReactionBadge } from "@/components/points/ReactionBar";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { WordBubble } from "@/components/tasks/detail/WordBubble";
import { Note, RevokedNote, TimeRequestNote, TranscriptSpoiler } from "@/components/tasks/TaskNotes";
import { humanAqtobe } from "@/lib/ai/time";
import { shortName } from "@/lib/people/names";
import { hasUnread, type BoardTask } from "@/lib/pulse/board";
import { isWorking } from "@/lib/tasks/lifecycle";
import { statusWord } from "@/lib/tasks/overview";
import type { ReactionCode } from "@/lib/points/reactions";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { TEXT, wordText } from "@/lib/tasks/status-text";

import { Icon } from "../icons";
import { EmployeeKeys, type EmployeeAction } from "./EmployeeKeys";
import { CardFoot, CardHead, CardShell } from "./TaskList";

/**
 * A card of «Мои дела». Closed: the state mark, the title, «when», who gave it, the state, «срочно» —
 * the same marks as the Лента card and the task's screen (D-194). Open: what the director wrote
 * and said (the recording and the words), a return for rework, the director's last word and the
 * buttons of FRONTEND «Состояние задачи → набор кнопок» (`EmployeeKeys`, principle 2) — nothing more
 * (D-194): the stages live on the task's own screen, one tap away.
 * A request still waiting is said on the card.
 */
export function EmployeeTaskCard({
  task,
  row,
  meId,
  open,
  now,
  onToggle,
  onAction,
  reaction = null,
  reactionPoints = null,
}: {
  task: TaskWithPeople;
  row: BoardTask | undefined;
  meId: string;
  open: boolean;
  now: Date;
  onToggle: () => void;
  onAction: (action: EmployeeAction, task: TaskWithPeople) => void;
  /** The director's reaction to this task (D-133): a gold outline and a badge inside. */
  reaction?: ReactionCode | null;
  /** What it brought, when points are on. */
  reactionPoints?: number | null;
}) {
  const unread = row ? hasUnread(row, meId) : false;
  const closed = task.status === "done" || task.status === "revoked" || task.status === "declined";
  const last = row?.last_message ?? null;
  const lastText = last ? wordText(last) : "";
  const lastName = last ? (last.sender_id === meId ? "Вы" : (task.author?.full_name ?? "Директор")) : "";
  // my own request for time, still waiting for the director (D-128); a new task has none to wait on
  const request = row?.time_request && isWorking(task.status) && task.status !== "sent" ? row.time_request : null;
  const suggested = task.status === "declined" ? shortName(row?.suggestion?.name) : undefined;
  // the deadline of work in hand asks for more time from where it stands (D-187) — not while a
  // request already waits, and a new task's «возьму, но к …» is the same sheet
  const whenDoor =
    task.deadline && isWorking(task.status) && !row?.time_request
      ? { label: `Сдать ${humanAqtobe(new Date(task.deadline), now)}. Попросить больше времени`, onPress: () => onAction("time", task) }
      : null;

  return (
    <CardShell
      id={task.id}
      open={open}
      closed={closed}
      onToggle={onToggle}
      testId="my-task"
      status={task.status}
      reacted={Boolean(reaction)}
      whenDoor={whenDoor}
      head={
        <CardHead
          task={task}
          now={now}
          open={open}
          // who gave it — the head of every card says it, as the Лента card and the task's screen do
          person={task.author?.full_name ?? null}
          unread={unread}
          closed={closed}
          word={statusWord(task, "employee", now)}
          // a new task is the holder's move — amber like a return, never the brand colour (D-194)
          wordTone={task.status === "sent" || task.status === "rework" ? "warn" : undefined}
          attention={task.status === "sent"}
        />
      }
    >
      <div className="pl-[34px]">
        {task.body ? <p className="whitespace-pre-line text-[15px] leading-[21px] text-text/85">{task.body}</p> : null}

        {reaction ? <ReactionBadge code={reaction} points={reactionPoints} className="mt-2" /> : null}

        {/* the head says «на доработке»; the note points to the director's comment only
            while that comment is not the last word shown right under it (D-173: said once) */}
        {task.status === "rework" && !(last && lastText && last.sender_id !== meId) ? (
          <Note tone="warn" icon={<Icon name="rotate" size={15} />}>
            {TEXT.reworkBanner}
          </Note>
        ) : null}
        {request ? <TimeRequestNote proposed={request.proposed} now={now} /> : null}
        {task.status === "revoked" ? <RevokedNote task={task} /> : null}
        {task.status === "declined" ? (
          <Note tone="danger" icon={<Icon name="hand" size={15} />}>
            Отказ отправлен директору{suggested ? ` · вы предложили: ${suggested}` : ""}
          </Note>
        ) : null}

        {last && lastText ? <WordBubble name={lastName} text={lastText} at={last.created_at} now={now} unread={unread} brief /> : null}

        {task.source_audio_path ? <AudioOriginal path={task.source_audio_path} /> : null}
        <TranscriptSpoiler task={task} />
      </div>

      {/* the three buttons, the card's whole job (principle 2); handed-in work has none — its
          state word «на проверке» says it waits for the director */}
      <EmployeeKeys status={task.status} onPress={(action) => onAction(action, task)} />

      <CardFoot href={`/tasks/${task.id}`} />
    </CardShell>
  );
}
