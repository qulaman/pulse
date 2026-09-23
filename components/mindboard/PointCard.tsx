"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Dot, NoteEditor, Original, SaveReceipt } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { CardShell } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { awaitsWords, firstLine, restLines } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { isOverdue, SHORT_STATUS } from "@/lib/tasks/status-text";

/** «→ Марат · принял» — what a handed-over point became, as the director's own phone says it. */
export function handedLabel(task: TaskWithPeople | undefined, now: Date): string {
  if (!task) return "→ поручено";
  const name = task.assignee?.full_name?.trim().split(/\s+/)[0];
  const state = isOverdue(task, now) ? "просрочена" : SHORT_STATUS[task.status];
  return [name ? `→ ${name}` : "→ поручено", state].filter(Boolean).join(" · ");
}

/** The number of a point, or its tick once it is done — read before any word. */
function Number({ n, done, waiting }: { n: number; done: boolean; waiting: boolean }) {
  const color = done ? "var(--ok)" : waiting ? "var(--warn)" : "var(--accent)";
  return (
    <span
      aria-hidden
      className="nums mt-[1px] flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[12px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {done ? <NoteIcon name="check" size={13} /> : n}
    </span>
  );
}

type Props = {
  point: Note;
  /** Place on the board, from 1. */
  n: number;
  now: Date;
  open: boolean;
  /** The words of this point are on their way from STT right now. */
  busy: boolean;
  /** Something of this point waits on the phone for the network. */
  offline: boolean;
  /** It exists only on the phone yet: no editing until it lands. */
  phoneOnly: boolean;
  task: TaskWithPeople | undefined;
  /** The handle to drag the point by — drawn over the card's corner by the list. */
  grip?: ReactNode;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onDone: () => void;
  onAssign: () => void;
  onDelete: () => void;
  onRetranscribe: () => void;
};

/**
 * One point of a board (D-102 §3), a card of the «Задачи» language: closed — the number (a
 * tick once it is done), the first line and the rest, voice, what it became; open, in place —
 * the text that saves itself, the recording, and three buttons: «Отметить», «Поручить»,
 * «Удалить». A point is a note underneath: the same editor, the same receipt, the same STT.
 */
export function PointCard(props: Props) {
  const { point, n, now, open, busy, offline, phoneOnly, task, grip, onToggle, onChangeText, onDone, onAssign, onDelete, onRetranscribe } = props;
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const waiting = awaitsWords(point) || (phoneOnly && !point.text.trim());
  const done = point.done_at !== null;
  const handed = point.converted_task_id !== null;
  const empty = !point.text.trim();
  const head = firstLine(point.text);
  const rest = restLines(point.text);
  const raw = point.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== point.text.trim();

  const heading = waiting ? (
    busy || phoneOnly ? (
      <span className="block" data-testid="point-transcribing">
        <span className="flex items-center gap-2 font-display text-[16px] font-semibold leading-[21px] text-muted">
          <Dot tone={phoneOnly ? "warn" : "accent"} pulse />
          {phoneOnly ? "Голос на телефоне" : "Распознаю…"}
        </span>
        {open ? null : <Bone h={13} w="72%" className="mt-2" />}
      </span>
    ) : (
      <span className="block">
        <span className="block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">Голосовой пункт</span>
        <span className="mt-0.5 block text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
          Не расслышал — голос сохранён
        </span>
      </span>
    )
  ) : (
    <>
      <span
        className={`${open ? "" : "line-clamp-2"} block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] ${done ? "text-text/55" : ""}`}
      >
        {head || "Без текста"}
      </span>
      {rest && !open ? <span className="mt-1 line-clamp-2 block whitespace-pre-line text-[14px] leading-[19px] text-muted">{rest}</span> : null}
    </>
  );

  const meta: ReactNode[] = [];
  if (done) meta.push(<span key="done" style={{ color: "var(--ok)" }}>отмечен</span>);
  if (handed) meta.push(<span key="handed" className="text-accent">{handedLabel(task, now)}</span>);
  if (point.audio_path) {
    meta.push(
      <span key="voice" className="inline-flex items-center gap-1">
        <NoteIcon name="wave" size={12} />
        голос
      </span>,
    );
  }
  if (offline || phoneOnly) meta.push(<span key="offline" style={{ color: "var(--warn)" }}>ждёт связи</span>);

  return (
    <div className="relative" data-point-id={point.id}>
      <CardShell
        id={point.id}
        open={open}
        closed={done}
        onToggle={onToggle}
        testId="point-card"
        headData={{ "data-point-id": point.id }}
        head={
          <>
            <Number n={n} done={done} waiting={waiting} />
            <span className="min-w-0 flex-1 pr-7">
              {heading}
              {meta.length > 0 ? (
                <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-muted">
                  {meta.map((item, index) => (
                    <span key={index} className="inline-flex items-center gap-1.5">
                      {index > 0 ? (
                        <span aria-hidden className="opacity-40">
                          ·
                        </span>
                      ) : null}
                      {item}
                    </span>
                  ))}
                </span>
              ) : null}
            </span>
          </>
        }
      >
        {phoneOnly ? (
          <p className="text-[14px] leading-[19px]" style={{ color: "var(--warn)" }}>
            Пункт ещё на телефоне — отправлю сам, как появится связь
          </p>
        ) : (
          <>
            <div className="flex min-h-[20px] items-center justify-between gap-2 text-[12px] leading-4 text-muted">
              <span className="nums">
                {humanAqtobe(new Date(point.created_at))}
                {point.audio_path ? " · голосом" : ""}
              </span>
              <SaveReceipt id={point.id} dirty={dirty} saved={saved} />
            </div>

            <div className="mt-2">
              <NoteEditor
                key={point.id}
                text={point.text}
                label="Текст пункта"
                onDirty={setDirty}
                onChangeText={(text) => {
                  setSaved(true);
                  onChangeText(text);
                }}
              />
            </div>

            {empty && point.audio_path ? (
              <div className="mt-2 flex items-center gap-2 text-[13px] leading-4" style={{ color: busy ? "var(--text-muted)" : "var(--warn)" }}>
                {busy ? <Dot tone="accent" pulse /> : null}
                {busy ? "Распознаю…" : "Не расслышал — впишите сами или распознайте ещё раз"}
                {busy ? null : (
                  <Button variant="secondary" size="sm" className="ml-auto" icon={<NoteIcon name="retry" size={14} />} onClick={onRetranscribe}>
                    Распознать
                  </Button>
                )}
              </div>
            ) : null}

            {point.audio_path ? <AudioOriginal path={point.audio_path} /> : null}
            {edited ? <Original raw={raw} /> : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                className={`!px-2 whitespace-nowrap !text-[14px] ${done ? "!border-ok/60 !text-ok" : ""}`}
                icon={<NoteIcon name="check" size={16} />}
                aria-pressed={done}
                data-testid="point-done"
                onClick={onDone}
              >
                {done ? "Снять" : "Отметить"}
              </Button>
              <Button className="!px-2 whitespace-nowrap !text-[14px]" icon={<NoteIcon name="task" size={16} />} disabled={empty || handed} data-testid="point-assign" onClick={onAssign}>
                {handed ? "Поручено" : "Поручить"}
              </Button>
              <Button variant="secondary" className="!px-2 whitespace-nowrap !text-[14px] !text-danger/80" icon={<NoteIcon name="trash" size={16} />} data-testid="point-delete" onClick={onDelete}>
                Удалить
              </Button>
            </div>

            <div className="-mx-1.5 mt-2 flex items-center">
              {handed && point.converted_task_id ? (
                <Link
                  href={`/tasks/${point.converted_task_id}`}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-[10px] px-1.5 text-[14px] font-semibold text-accent transition-colors duration-[120ms] active:bg-accent/10"
                >
                  Открыть задачу
                </Link>
              ) : null}
              <button type="button" onClick={onToggle} className="ml-auto min-h-[40px] rounded-[10px] px-2 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.05]">
                Свернуть
              </button>
            </div>
          </>
        )}
      </CardShell>
      {grip ? <span className="absolute right-1.5 top-2">{grip}</span> : null}
    </div>
  );
}
