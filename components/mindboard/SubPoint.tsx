"use client";

import { useState, type ReactNode } from "react";

import { Dot, NoteEditor, Original, SaveReceipt } from "@/components/notes/NoteCard";
import { NoteIcon, type NoteIconName } from "@/components/notes/icons";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { whenRu } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import type { LineState } from "@/lib/mindboard/branch";
import { handedLabel } from "@/lib/mindboard/handed";
import type { Wait } from "@/lib/mindboard/offline";

/** What a line without words says instead. */
export const STATE_WORDS: Record<Exclude<LineState, "words">, string> = {
  saving: "Сохраняю голос…",
  phone: "Голос на телефоне",
  point: "Голос ждёт свой пункт",
  hearing: "Распознаю…",
  deaf: "Не расслышал — голос сохранён",
};

/** The tone of the words of a line without words: a warning only where the director may have to act. */
export function stateTone(state: LineState): string {
  return state === "deaf" || state === "phone" ? "text-warn" : "text-muted";
}

/** «ждёт связи» / «ждёт свой пункт» in the meta line of a waiting line (D-121). */
export function WaitMark({ wait }: { wait: Wait }) {
  return wait === "point" ? (
    <span data-testid="line-wait" data-wait="point">
      ждёт свой пункт
    </span>
  ) : (
    <span data-testid="line-wait" data-wait="network" style={{ color: "var(--warn)" }}>
      ждёт связи
    </span>
  );
}

/**
 * The marker of a sub-point (D-121): a dot where a point has its number — a tick once it is
 * done, a breathing dot while its words are on the way. Sits in the 20 px line of the text.
 */
export function SubMarker({ done, state }: { done: boolean; state: LineState }) {
  if (done) {
    return (
      <span aria-hidden className="flex h-5 w-[14px] shrink-0 items-center justify-center" style={{ color: "var(--ok)" }}>
        <NoteIcon name="check" size={13} />
      </span>
    );
  }
  if (state === "hearing" || state === "saving" || state === "phone" || state === "point") {
    return (
      <span aria-hidden className="flex h-5 w-[14px] shrink-0 items-center justify-center">
        <Dot tone={state === "phone" ? "warn" : "accent"} pulse />
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-5 w-[14px] shrink-0 items-center justify-center">
      <span className="h-[6px] w-[6px] rounded-full" style={{ background: state === "deaf" ? "var(--warn)" : "color-mix(in srgb, var(--text) 42%, transparent)" }} />
    </span>
  );
}

/** A sub-point in the glimpse of a closed card: the marker and up to two lines. */
export function SubLine({ sub, state }: { sub: Note; state: LineState }) {
  const done = sub.done_at !== null;
  const words = state === "words" ? sub.text.trim() || "Без текста" : STATE_WORDS[state];
  return (
    <span className="flex items-start gap-2" data-testid="point-sub" data-sub-id={sub.id}>
      <SubMarker done={done} state={state} />
      <span className={`line-clamp-2 min-w-0 text-[15px] leading-5 ${state !== "words" ? stateTone(state) : done ? "text-text/45" : "text-text/85"}`}>
        {words}
      </span>
    </span>
  );
}

/** One square action of an open sub-point: the icon over its word, a thumb-sized target. */
function Tile({
  icon,
  label,
  onClick,
  color,
  pressed,
  disabled,
  testId,
}: {
  icon: NoteIconName;
  label: string;
  onClick: () => void;
  color?: string;
  pressed?: boolean;
  disabled?: boolean;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={pressed}
      data-testid={testId}
      className="flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-1 rounded-[12px] bg-white/[0.045] px-1 font-display text-[12px] font-semibold leading-4 transition-[transform,background-color] duration-[120ms] active:scale-[0.96] active:bg-white/[0.09] disabled:opacity-40"
      style={{ color: color ?? "var(--text)" }}
    >
      <NoteIcon name={icon} size={18} />
      <span className="max-w-full truncate">{label}</span>
    </button>
  );
}

type RowProps = {
  sub: Note;
  now: Date;
  open: boolean;
  state: LineState;
  /** Something of this sub-point waits on the phone: for the network, or for its point to land first. */
  wait: Wait | null;
  /** It exists only on the phone yet: nothing to edit until it lands. */
  phone: boolean;
  task: TaskWithPeople | undefined;
  /** The handle that moves it among its siblings (D-121); absent while it cannot move. */
  grip?: ReactNode;
  onToggle: () => void;
  onChangeText: (text: string) => void;
  onDone: () => void;
  onAssign: () => void;
  /** «Вынести в пункты»; absent while it cannot be moved (still only on the phone). */
  onPromote?: () => void;
  onDelete: () => void;
  onRetranscribe: () => void;
};

/**
 * A sub-point inside an open point (D-121): a line with its marker that opens in place — the
 * text that saves itself, the recording, and four squares: «Отметить», «Поручить», «В пункты»,
 * «Удалить». A sub-point is a note underneath, like its point: the same editor, the same STT.
 */
export function SubPointRow(props: RowProps) {
  const { sub, now, open, state, wait, phone, task, grip, onToggle, onChangeText, onDone, onAssign, onPromote, onDelete, onRetranscribe } = props;
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const done = sub.done_at !== null;
  const handed = sub.converted_task_id !== null;
  const empty = !sub.text.trim();
  const raw = sub.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== sub.text.trim();
  const words = state === "words" ? sub.text.trim() || "Без текста" : STATE_WORDS[state];

  const meta: ReactNode[] = [];
  if (handed) meta.push(<span key="handed" className="text-accent">{handedLabel(task, now)}</span>);
  if (sub.audio_path) {
    meta.push(
      <span key="voice" className="inline-flex items-center gap-1">
        <NoteIcon name="wave" size={12} />
        голос
      </span>,
    );
  }
  // a line without words already says what it waits for in its own words («Голос на телефоне»)
  if (wait && state === "words") meta.push(<WaitMark key="wait" wait={wait} />);

  if (!open) {
    return (
      <div className="relative" data-sub-id={sub.id}>
        <button
          type="button"
          aria-expanded={false}
          onClick={onToggle}
          data-testid="sub-row"
          className={`flex min-h-[44px] w-full items-start gap-2 rounded-[12px] py-3 pl-1 text-left transition-colors duration-[120ms] active:bg-white/[0.05] ${grip ? "pr-11" : "pr-2"}`}
        >
          <SubMarker done={done} state={state} />
          <span className="min-w-0 flex-1">
            <span
              className={`block whitespace-pre-line text-[15px] leading-5 [overflow-wrap:anywhere] ${
                state !== "words" ? stateTone(state) : done ? "text-text/45" : "text-text/90"
              }`}
            >
              {words}
            </span>
            {meta.length > 0 ? (
              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-muted">
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
        </button>
        {grip ? <span className="absolute right-0 top-0">{grip}</span> : null}
      </div>
    );
  }

  return (
    <div
      className="my-1 rounded-[14px] border border-border/70 bg-white/[0.02] px-3 pb-3 pt-0.5"
      data-sub-id={sub.id}
      data-testid="sub-open"
    >
      <div className="flex min-h-[44px] items-center gap-2">
        <SubMarker done={done} state={state} />
        <span className="nums min-w-0 flex-1 truncate text-[12px] leading-4 text-muted">
          подпункт · {whenRu(sub.created_at, now)}
          {sub.audio_path ? " · голосом" : ""}
        </span>
        {phone ? null : <SaveReceipt id={sub.id} dirty={dirty} saved={saved} />}
        <button
          type="button"
          aria-expanded
          aria-label="Свернуть подпункт"
          onClick={onToggle}
          className="-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-muted transition-colors duration-[120ms] active:bg-white/[0.06]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M5.5 15 12 8.5 18.5 15" />
          </svg>
        </button>
      </div>

      {phone ? (
        <p className={`pb-1 text-[14px] leading-[19px] ${wait === "point" ? "text-muted" : "text-warn"}`} data-testid="sub-phone">
          {wait === "point"
            ? "Подпункт ждёт свой пункт — отправлю вместе с ним"
            : wait === "network"
              ? "Подпункт ещё на телефоне — отправлю сам, как появится связь"
              : "Подпункт ещё на телефоне — отправляю"}
        </p>
      ) : (
        <>
          <NoteEditor
            key={sub.id}
            text={sub.text}
            label="Текст подпункта"
            onDirty={setDirty}
            onChangeText={(text) => {
              setSaved(true);
              onChangeText(text);
            }}
          />

          {empty && sub.audio_path ? (
            <div className="mt-2 flex items-center gap-2 text-[13px] leading-4" style={{ color: state === "hearing" ? "var(--text-muted)" : "var(--warn)" }}>
              {state === "hearing" ? <Dot tone="accent" pulse /> : null}
              {state === "hearing" ? "Распознаю…" : "Не расслышал — впишите сами или распознайте ещё раз"}
              {state === "hearing" ? null : (
                <Button variant="secondary" size="sm" className="ml-auto shrink-0" icon={<NoteIcon name="retry" size={14} />} onClick={onRetranscribe}>
                  Распознать
                </Button>
              )}
            </div>
          ) : null}

          {sub.audio_path ? <AudioOriginal path={sub.audio_path} /> : null}
          {edited ? <Original raw={raw} /> : null}
          {handed ? <p className="mt-2 text-[12px] leading-4 text-accent">{handedLabel(task, now)}</p> : null}

          <div className="mt-3 grid grid-cols-4 gap-1.5">
            <Tile icon="check" label={done ? "Снять" : "Отметить"} pressed={done} color={done ? "var(--ok)" : undefined} onClick={onDone} testId="sub-done" />
            <Tile icon="task" label={handed ? "Поручено" : "Поручить"} disabled={empty || handed} onClick={onAssign} testId="sub-assign" />
            <Tile icon="outdent" label="В пункты" disabled={!onPromote} onClick={() => onPromote?.()} testId="sub-promote" />
            <Tile icon="trash" label="Удалить" color="color-mix(in srgb, var(--danger) 85%, transparent)" onClick={onDelete} testId="sub-delete" />
          </div>
        </>
      )}
    </div>
  );
}
