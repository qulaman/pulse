"use client";

import { AnimatePresence, Reorder } from "framer-motion";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Dot, NoteEditor, Original, SaveReceipt } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { CardShell } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { glimpse, lineState, type LineState } from "@/lib/mindboard/branch";
import { handedLabel } from "@/lib/mindboard/handed";
import type { Wait } from "@/lib/mindboard/offline";
import type { Branch } from "@/lib/mindboard/tree";
import type { Dictation } from "@/lib/notes/dictation";
import { firstLine, restLines, whenRu } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import { DragRow, useReorder } from "./DragRow";
import { SubComposer } from "./SubComposer";
import { STATE_WORDS, SubLine, SubPointRow, WaitMark } from "./SubPoint";

/**
 * How the screen sees each row: still only on the phone, what it waits for (the network, or
 * its own point — D-121), being heard, what it became.
 */
export type RowLook = {
  phone: (id: string) => boolean;
  wait: (row: Note) => Wait | null;
  hearing: (id: string) => boolean;
  task: (row: Note) => TaskWithPeople | undefined;
};

export function stateOf(row: Note, look: RowLook): LineState {
  return lineState(row, { phone: look.phone(row.id), wait: look.wait(row), hearing: look.hearing(row.id) });
}

/** The number of a point as the wall has it, its tick once done, or its voice while it has no words yet. */
function Number({ n, done, state }: { n: number | null; done: boolean; state: LineState }) {
  const color = done ? "var(--ok)" : state === "deaf" || state === "phone" ? "var(--warn)" : "var(--accent)";
  return (
    <span
      aria-hidden
      className="nums mt-[1px] flex h-[22px] min-w-[22px] shrink-0 items-center justify-center rounded-full px-1 text-[12px] font-bold"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {done ? <NoteIcon name="check" size={13} /> : n !== null ? n : <NoteIcon name="wave" size={12} />}
    </span>
  );
}

function Meta({ items }: { items: ReactNode[] }) {
  if (items.length === 0) return null;
  return (
    <span className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12px] leading-4 text-muted">
      {items.map((item, index) => (
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
  );
}

export type PointHandlers = {
  toggle: () => void;
  toggleSub: (id: string) => void;
  text: (row: Note, text: string) => void;
  done: (row: Note) => void;
  assign: (row: Note) => void;
  remove: (row: Note) => void;
  retranscribe: (row: Note) => void;
  /** A sub-point typed under this point. */
  write: (text: string) => void;
  /** A sub-point dropped between its siblings (D-121): one row written, its new place. */
  place: (sub: Note, position: number) => void;
  /** The screen's microphone is about to open for a sub-point of this point. */
  aim: () => void;
  /** «Сделать подпунктом» — offered only where the server will take it. */
  demote?: () => void;
  /** «Вынести в пункты» of one of its sub-points; absent for a sub-point still on the phone. */
  promote: (sub: Note) => (() => void) | undefined;
  /** «Показать на стене» — only while the board is on the wall and the point can be lit. */
  spotlight?: (on: boolean) => void;
};

type Props = {
  branch: Branch<Note>;
  /** The number the wall gives it; null — no words yet. */
  n: number | null;
  /** Words of the button that puts it under the point above: «пункта 2». */
  demoteLabel: string | null;
  now: Date;
  open: boolean;
  openSub: string | null;
  /** The wall shows this point now (D-121). */
  lit: boolean;
  look: RowLook;
  grip?: ReactNode;
  dictation: Dictation;
  aimed: string | null;
  on: PointHandlers;
};

/**
 * One branch of a board (D-102 §3, D-121), a card of the «Задачи» language. Closed — the
 * number the wall gives it (a tick once done), the words, its first sub-points under a dot
 * marker and «ещё N», what it became; lit with the accent while the wall shows it. Open, in
 * place — the text that saves itself, the recording, the sub-points (each opens in place and
 * moves by its handle), «+ подпункт» with the microphone, «Показать на стене» during a meeting,
 * and «Отметить / Поручить / Удалить». A point is a note underneath, and so is a sub-point.
 */
export function PointCard({ branch, n, demoteLabel, now, open, openSub, lit, look, grip, dictation, aimed, on }: Props) {
  const { point, children } = branch;
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const phone = look.phone(point.id);
  const wait = look.wait(point);
  const state = stateOf(point, look);
  // the sub-points move by their handles inside the open card, never out of their branch
  const subIds = children.map((sub) => sub.id);
  const subById = new Map(children.map((sub) => [sub.id, sub]));
  const subOrder = useReorder(subIds, (id) => subById.get(id)?.position ?? 0, (id, position) => {
    const sub = subById.get(id);
    if (sub) on.place(sub, position);
  });
  const task = look.task(point);
  const done = point.done_at !== null;
  const handed = point.converted_task_id !== null;
  const empty = !point.text.trim();
  const head = firstLine(point.text);
  const rest = restLines(point.text);
  const raw = point.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== point.text.trim();

  const heading =
    state === "words" ? (
      <>
        <span className={`line-clamp-2 font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] ${done ? "text-text/55" : ""}`}>
          {head || "Без текста"}
        </span>
        {rest && !open ? <span className="mt-1 line-clamp-2 whitespace-pre-line text-[14px] leading-[19px] text-muted">{rest}</span> : null}
      </>
    ) : state === "deaf" ? (
      <span className="block">
        <span className="block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">Голосовой пункт</span>
        <span className="mt-0.5 block text-[13px] leading-[18px]" style={{ color: "var(--warn)" }}>
          {STATE_WORDS.deaf}
        </span>
      </span>
    ) : (
      <span className="block" data-testid="point-transcribing">
        <span className="flex items-center gap-2 font-display text-[16px] font-semibold leading-[21px] text-muted">
          <Dot tone={state === "phone" ? "warn" : "accent"} pulse />
          {STATE_WORDS[state]}
        </span>
        {open || state !== "hearing" ? null : <Bone h={13} w="72%" className="mt-2" />}
      </span>
    );

  const meta: ReactNode[] = [];
  if (lit) {
    meta.push(
      <span key="lit" className="inline-flex items-center gap-1.5 font-semibold text-accent" data-testid="point-lit">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} />
        на стене сейчас
      </span>,
    );
  }
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
  // a point without words already says what it waits for in its own words («Голос на телефоне»)
  if (wait && state === "words") meta.push(<WaitMark key="wait" wait={wait} />);

  const { shown, more } = glimpse(children);

  return (
    <div
      className={`relative ${
        lit
          ? "[&>article]:!scroll-mb-[180px] [&>article]:!border-accent/70 [&>article]:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_14%,transparent),0_10px_28px_color-mix(in_srgb,var(--accent)_12%,transparent)]"
          : ""
      }`}
      data-point-id={point.id}
      data-lit={lit || undefined}
    >
      <CardShell
        id={point.id}
        open={open}
        closed={done}
        onToggle={on.toggle}
        testId="point-card"
        headData={{ "data-point-id": point.id }}
        head={
          <>
            <Number n={n} done={done} state={state} />
            <span className={`min-w-0 flex-1 ${grip ? "pr-8" : ""}`}>
              {heading}
              {!open && shown.length > 0 ? (
                <span className="mt-2 flex flex-col gap-1" data-testid="point-glimpse">
                  {shown.map((sub) => (
                    <SubLine key={sub.id} sub={sub} state={stateOf(sub, look)} />
                  ))}
                  {more > 0 ? (
                    <span className="pl-[22px] text-[13px] leading-[18px] text-muted" data-testid="point-more">
                      ещё {more}
                    </span>
                  ) : null}
                </span>
              ) : null}
              <Meta items={meta} />
            </span>
          </>
        }
      >
        {phone ? (
          <p className={`text-[14px] leading-[19px] ${wait ? "text-warn" : "text-muted"}`} data-testid="point-phone">
            {wait ? "Пункт ещё на телефоне — отправлю сам, как появится связь." : "Пункт ещё на телефоне — отправляю."} Подпункты можно добавлять уже сейчас.
          </p>
        ) : (
          <>
            <div className="flex min-h-[20px] items-center justify-between gap-2 text-[12px] leading-4 text-muted">
              <span className="nums">
                {whenRu(point.created_at, now)}
                {point.audio_path ? " · голосом" : ""}
              </span>
              <SaveReceipt id={point.id} dirty={dirty} saved={saved} />
            </div>

            <div className="mt-2">
              <NoteEditor
                // born again when STT brings the words (raw_transcript), never while the director types
                key={`${point.id}:${point.raw_transcript ?? ""}`}
                text={point.text}
                label="Текст пункта"
                onDirty={setDirty}
                onChangeText={(text) => {
                  setSaved(true);
                  on.text(point, text);
                }}
              />
            </div>

            {empty && point.audio_path ? (
              <div className="mt-2 flex items-center gap-2 text-[13px] leading-4" style={{ color: state === "hearing" ? "var(--text-muted)" : "var(--warn)" }}>
                {state === "hearing" ? <Dot tone="accent" pulse /> : null}
                {state === "hearing" ? "Распознаю…" : "Не расслышал — впишите сами или распознайте ещё раз"}
                {state === "hearing" ? null : (
                  <Button variant="secondary" size="sm" className="ml-auto shrink-0" icon={<NoteIcon name="retry" size={14} />} onClick={() => on.retranscribe(point)}>
                    Распознать
                  </Button>
                )}
              </div>
            ) : null}

            {point.audio_path ? <AudioOriginal path={point.audio_path} /> : null}
            {edited ? <Original raw={raw} /> : null}
          </>
        )}

        {/* the branch: sub-points in their order, then the row that adds the next one */}
        <section className="mt-4" aria-label="Подпункты" data-testid="point-branch">
          {children.length > 0 ? (
            <h3 className="flex items-center gap-2 px-1 pb-0.5 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted">
              Подпункты
              <span className="nums">{children.length}</span>
            </h3>
          ) : null}
          {children.length > 0 ? (
            <Reorder.Group as="div" axis="y" values={subOrder.order} onReorder={subOrder.onReorder} className="flex flex-col" data-testid="point-subs">
              <AnimatePresence initial={false} mode="popLayout">
                {subOrder.order.map((subId, index) => {
                  const sub = subById.get(subId);
                  if (!sub) return null;
                  const subOpen = openSub === sub.id;
                  return (
                    <DragRow
                      key={sub.id}
                      id={sub.id}
                      // a sub-point that is still only on the phone has no row to move yet
                      movable={children.length > 1 && !subOpen && !look.phone(sub.id)}
                      label={`Перетащить подпункт ${index + 1}`}
                      testId="sub-grip"
                      layout="position"
                      onStart={subOrder.start}
                      onEnd={() => subOrder.drop(sub.id)}
                    >
                      {(subGrip) => (
                        <SubPointRow
                          sub={sub}
                          now={now}
                          open={subOpen}
                          state={stateOf(sub, look)}
                          wait={look.wait(sub)}
                          phone={look.phone(sub.id)}
                          task={look.task(sub)}
                          grip={subGrip}
                          onToggle={() => on.toggleSub(sub.id)}
                          onChangeText={(text) => on.text(sub, text)}
                          onDone={() => on.done(sub)}
                          onAssign={() => on.assign(sub)}
                          onPromote={on.promote(sub)}
                          onDelete={() => on.remove(sub)}
                          onRetranscribe={() => on.retranscribe(sub)}
                        />
                      )}
                    </DragRow>
                  );
                })}
              </AnimatePresence>
            </Reorder.Group>
          ) : null}

          <SubComposer pointId={point.id} dictation={dictation} aimed={aimed} onAim={on.aim} onWrite={on.write} first={children.length === 0} />

          {on.demote && demoteLabel ? (
            <button
              type="button"
              onClick={on.demote}
              data-testid="point-demote"
              className="-mx-1 mt-1 flex min-h-[44px] items-center gap-2 rounded-[12px] px-2 text-[14px] font-semibold text-accent transition-colors duration-[120ms] active:bg-accent/10"
            >
              <NoteIcon name="indent" size={17} />
              Сделать подпунктом {demoteLabel}
            </button>
          ) : null}
        </section>

        {phone ? null : (
          <>
            {on.spotlight ? (
              <button
                type="button"
                aria-pressed={lit}
                onClick={() => on.spotlight?.(!lit)}
                data-testid="point-spotlight"
                className={`mt-4 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-[14px] border px-3 text-[15px] font-semibold transition-[transform,background-color,border-color] duration-[120ms] active:scale-[0.98] ${
                  lit ? "border-accent/60 bg-accent/[0.12] text-accent" : "border-border/80 bg-white/[0.03] text-text"
                }`}
              >
                {lit ? (
                  <span aria-hidden className="h-2 w-2 rounded-full bg-accent" style={{ boxShadow: "0 0 10px var(--accent)" }} />
                ) : (
                  <NoteIcon name="wall" size={18} />
                )}
                {lit ? "На стене сейчас — снять" : "Показать на стене"}
              </button>
            ) : null}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <Button
                variant="secondary"
                className={`!px-2 whitespace-nowrap !text-[14px] ${done ? "!border-ok/60 !text-ok" : ""}`}
                icon={<NoteIcon name="check" size={16} />}
                aria-pressed={done}
                data-testid="point-done"
                onClick={() => on.done(point)}
              >
                {done ? "Снять" : "Отметить"}
              </Button>
              <Button className="!px-2 whitespace-nowrap !text-[14px]" icon={<NoteIcon name="task" size={16} />} disabled={empty || handed} data-testid="point-assign" onClick={() => on.assign(point)}>
                {handed ? "Поручено" : "Поручить"}
              </Button>
              <Button
                variant="secondary"
                className="!px-2 whitespace-nowrap !text-[14px] !text-danger/80"
                icon={<NoteIcon name="trash" size={16} />}
                data-testid="point-delete"
                onClick={() => on.remove(point)}
              >
                Удалить
              </Button>
            </div>
          </>
        )}

        <div className="-mx-1.5 mt-2 flex items-center">
          {handed && point.converted_task_id ? (
            <Link
              href={`/tasks/${point.converted_task_id}`}
              className="flex min-h-[44px] items-center gap-1.5 rounded-[10px] px-1.5 text-[14px] font-semibold text-accent transition-colors duration-[120ms] active:bg-accent/10"
            >
              Открыть задачу
            </Link>
          ) : null}
          <button
            type="button"
            onClick={on.toggle}
            className="ml-auto min-h-[44px] rounded-[10px] px-2 text-[14px] font-semibold text-muted transition-colors duration-[120ms] active:bg-white/[0.05]"
          >
            Свернуть
          </button>
        </div>
      </CardShell>
      {grip ? <span className="absolute right-0.5 top-[5px]">{grip}</span> : null}
    </div>
  );
}
