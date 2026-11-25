"use client";

import { Ellipsis } from "lucide-react";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from "react";

import { IconButton } from "@/components/desk/ui/IconButton";
import { Menu, type MenuItem } from "@/components/desk/ui/Menu";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { When } from "@/components/desk/ui/When";
import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { AssignSheet } from "@/components/notes/AssignSheet";
import { Original, SaveReceipt } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { RemindSheet } from "@/components/notes/RemindSheet";
import { AudioOriginal } from "@/components/tasks/AudioOriginal";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { splitList } from "@/lib/mindboard/split";
import { awaitsReminder, firstLine, isConverted, reminderRu, remindPresets, restLines, trashExpiresAt, TRASH_DAYS, whenRu } from "@/lib/notes/list";
import { useUpdateNote } from "@/lib/notes/mutations";
import type { Note } from "@/lib/notes/queries";
import { useSentTasks } from "@/lib/tasks/queries";
import { pluralRu, SHORT_STATUS } from "@/lib/tasks/status-text";
import { holdUpdate } from "@/lib/update/client";

import type { Intent } from "./keys";
import { useNotesDesk } from "./NotesDesk";
import { isThought, type BoardTarget } from "./useNoteActions";

/** A pause in typing this long saves the text — the phone's own rhythm. */
const SAVE_DEBOUNCE_MS = 600;
/** Boards listed in «На доску» before «Все доски…». */
const BOARDS_SHOWN = 7;
/** First lines listed when several notes are chosen. */
const PICKED_SHOWN = 8;

/**
 * The right column of «Заметки» (D-177): the chosen note as a document — a bar of actions on top
 * («Поручить» the one white button, «Напомнить ▾», «На доску ▾», the save receipt, «⋯»), the meta
 * as chips, the voice right under them, the first line set as a title (still plain text, D-75),
 * saved by itself. A note that became something, or lies in the bin, reads as a document of what
 * it is; several chosen notes get one bar for all. Nothing chosen — a hint, never the newest
 * thought on an office screen.
 */
export function NoteDetail() {
  const { rows, selectedId, loading, reading, picked, tab, emptyAccount } = useNotesDesk();
  if (picked.size > 1) return <Picked />;
  const note = selectedId ? (rows.find((row) => row.id === selectedId) ?? null) : null;

  if (!selectedId) return <Hint tab={tab} empty={emptyAccount} />;
  if (!note) {
    if (loading || reading) return <DocBone />;
    return (
      <Quiet title="Заметки нет" hint="Возможно, её удалили навсегда — или она чужая.">
        <span />
      </Quiet>
    );
  }
  if (note.deleted_at !== null) return <Trashed key={note.id} note={note} />;
  if (isConverted(note)) return <Converted key={note.id} note={note} />;
  if (note.board_id !== null) return <OnBoard note={note} />;
  return <Thought key={note.id} note={note} />;
}

/* ------------------------------------------------------------------ hints */

function Quiet({ title, hint, children }: { title: string; hint: ReactNode; children?: ReactNode }) {
  return (
    <div className="nb-quiet" data-testid="desk-note-hint">
      <p className="nb-quiet-title">{title}</p>
      <p className="nb-quiet-hint">{hint}</p>
      {children}
    </div>
  );
}

/** Nothing chosen: what this view is for, in its own words (D-177). */
function Hint({ tab, empty }: { tab: string; empty: boolean }) {
  if (empty) {
    return (
      <Quiet
        title="Запишите мысль — её видите только вы"
        hint="Напишите строкой слева или скажите в микрофон — с любого экрана тоже можно, клавиши — по «?»."
      />
    );
  }
  if (tab === "converted") return <Quiet title="Мысли, ставшие делом" hint="Выберите строку слева — увидите, чем стала мысль и как идёт задача." />;
  if (tab === "trash") return <Quiet title="Корзина" hint={`Удалённая мысль ждёт здесь ${TRASH_DAYS} дня, потом исчезнет. Выберите строку — вернуть её или удалить навсегда.`} />;
  return (
    <Quiet
      title="Выберите заметку слева"
      hint="Её текст, напоминание и что с ней сделать — здесь."
    />
  );
}

function DocBone() {
  return (
    <div className="nb-doc-wrap" aria-hidden>
      <div className="nb-bar" />
      <div className="nb-doc skeleton">
        <div className="flex gap-2">
          <Bone w={120} h={22} />
          <Bone w={96} h={22} />
        </div>
        <Bone w="70%" h={28} className="mt-5" />
        <Bone w="92%" h={16} className="mt-4" />
        <Bone w="86%" h={16} className="mt-2.5" />
        <Bone w="64%" h={16} className="mt-2.5" />
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- the bar */

function Chevron() {
  return (
    <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden className="nb-chevron">
      <polyline points="4,6 8,10 12,6" />
    </svg>
  );
}

/** A quiet button of the bar that opens a menu under itself; its element is the menu's anchor. */
function BarButton({
  label,
  keys,
  icon,
  children,
  open,
  onOpen,
  anchorRef,
  testId,
  tone,
  disabled = false,
}: {
  label: string;
  keys?: string[];
  icon?: ReactNode;
  children?: ReactNode;
  open: boolean;
  onOpen: () => void;
  anchorRef: (node: HTMLButtonElement | null) => void;
  testId?: string;
  tone?: "warn";
  disabled?: boolean;
}) {
  return (
    <Tooltip label={label} keys={keys} side="bottom">
      <button
        ref={anchorRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={children ? undefined : label}
        disabled={disabled}
        onClick={onOpen}
        data-testid={testId}
        data-tone={tone}
        className={`nb-bar-button desk-focus ${children ? "" : "nb-bar-icon"}`}
      >
        {icon}
        {children}
        {children ? <Chevron /> : null}
      </button>
    </Tooltip>
  );
}

/** Menus of «На доску»: the live boards (the one on the wall first), «Все доски…», a new one. */
function boardItems(boards: { id: string; title: string }[], pick: (target: BoardTarget) => void, all: () => void, fresh: () => void): MenuItem[] {
  return [
    ...boards.slice(0, BOARDS_SHOWN).map((board) => ({ key: board.id, label: board.title, icon: <NoteIcon name="board" size={14} />, onSelect: () => pick({ id: board.id, title: board.title, fresh: false }) })),
    ...(boards.length > BOARDS_SHOWN ? [{ key: "all", label: "Все доски…", onSelect: all }] : []),
    ...(boards.length > 0 ? ["separator" as const] : []),
    { key: "new", label: "Новая доска", icon: <NoteIcon name="plus" size={14} />, onSelect: fresh },
  ];
}

function remindItems(now: Date, current: string | null, pick: (iso: string | null) => void, custom: () => void): MenuItem[] {
  return [
    ...remindPresets(now).map((preset) => ({ key: preset.label, label: preset.label, icon: <NoteIcon name="bell" size={14} />, onSelect: () => pick(preset.at.toISOString()) })),
    { key: "custom", label: "Своё время…", icon: <NoteIcon name="flag" size={14} />, onSelect: custom },
    ...(current ? ["separator" as const, { key: "clear", label: "Не напоминать", icon: <NoteIcon name="x" size={14} />, onSelect: () => pick(null) }] : []),
  ];
}

/* ---------------------------------------------------------- a live thought */

/** A live thought: the bar of actions, the chips, the voice, the page of text. */
function Thought({ note }: { note: Note }) {
  const { me, now, liveBoards, summaries, intent, setIntent, actions, hearing, dictation } = useNotesDesk();
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [remindEl, setRemindEl] = useState<HTMLButtonElement | null>(null);
  const [boardEl, setBoardEl] = useState<HTMLButtonElement | null>(null);
  const [moreEl, setMoreEl] = useState<HTMLButtonElement | null>(null);
  const update = useUpdateNote(me);

  const mine = intent?.id === note.id ? intent.kind : null;
  const open = (kind: Intent["kind"]) => setIntent(mine === kind ? null : { id: note.id, kind });
  const close = () => setIntent(null);

  const empty = !note.text.trim();
  const raw = note.raw_transcript?.trim() ?? "";
  const edited = raw !== "" && raw !== note.text.trim();
  const ringing = awaitsReminder(note);
  const reminder = reminderRu(note, now);
  const rung = note.reminded_at !== null && reminder !== null;
  const wordless = empty && note.audio_path !== null;
  const listening = hearing(note);
  const lines = splitList(note.text);

  const remindLabel = ringing && reminder ? reminder : rung ? `${reminder} · ещё раз` : "Напомнить";

  const moreItems: MenuItem[] = [
    { key: "pin", label: note.pinned ? "Открепить" : "Закрепить сверху", hint: "P", icon: <NoteIcon name="pin" size={14} />, onSelect: () => actions.pin(note) },
    { key: "copy", label: "Скопировать текст", icon: <NoteIcon name="copy" size={14} />, disabled: empty, onSelect: () => actions.copy(note) },
    "separator",
    { key: "announce", label: "Объявить…", hint: "A", icon: <NoteIcon name="megaphone" size={14} />, disabled: empty, onSelect: () => actions.announce(note) },
    { key: "deadline", label: "Поручить со сроком…", icon: <NoteIcon name="task" size={14} />, disabled: empty, onSelect: () => actions.assignWithDeadline(note) },
    ...(lines && lines.length > 1
      ? [{ key: "split", label: `Разложить по строкам на доску · ${lines.length}`, icon: <NoteIcon name="stack" size={14} />, onSelect: () => setIntent({ id: note.id, kind: "split" }) }]
      : []),
    "separator",
    {
      key: "bin",
      label: "В корзину",
      hint: "Del",
      danger: true,
      icon: <NoteIcon name="trash" size={14} />,
      onSelect: () => actions.bin(note),
    },
  ];

  const backToList = () => {
    const row = document.getElementById(`nb-row-${note.id}`);
    if (row) {
      row.focus({ preventScroll: true });
      row.scrollIntoView({ block: "nearest" });
    } else (document.activeElement as HTMLElement | null)?.blur();
  };

  return (
    <div className="nb-doc-wrap" data-testid="desk-note">
      {/* the bar stays on top while a long note scrolls under it */}
      <div className="nb-bar">
        <Tooltip label="Поручить кому-то из команды — клик по имени отправит" keys={["T"]} side="bottom">
          <Button size="sm" icon={<NoteIcon name="task" size={15} />} disabled={empty} onClick={() => open("assign")} data-testid="desk-note-assign">
            Поручить
          </Button>
        </Tooltip>
        <BarButton
          label="Напомнить"
          keys={["R"]}
          icon={<NoteIcon name="bell" size={15} />}
          open={mine === "remind"}
          onOpen={() => open("remind")}
          anchorRef={setRemindEl}
          testId="desk-note-remind"
          tone={ringing || (reminder !== null && !rung) ? "warn" : undefined}
        >
          <span className="nums truncate">{remindLabel}</span>
        </BarButton>
        <BarButton label="На доску" keys={["B"]} icon={<NoteIcon name="board" size={15} />} open={mine === "board"} onOpen={() => open("board")} anchorRef={setBoardEl} testId="desk-note-board" disabled={empty}>
          На доску
        </BarButton>
        <span className="ml-auto pr-1">
          <SaveReceipt id={note.id} dirty={dirty} saved={saved} />
        </span>
        <BarButton label="Ещё" icon={<Ellipsis size={16} />} open={mine === "more" || mine === "split"} onOpen={() => open("more")} anchorRef={setMoreEl} testId="desk-note-more" />
        {/* the bin stays one click away, as before: the smoke and the hands know it */}
        <IconButton label="В корзину" keys={["Del"]} icon={<NoteIcon name="trash" size={16} />} tone="danger" onClick={() => actions.bin(note)} testId="desk-note-delete" />
      </div>

      <div className="nb-doc">
        <div className="nb-chips">
          <span className="nb-chip">
            <NoteIcon name="note" size={12} />
            <When>{whenRu(note.created_at, now)}</When>
          </span>
          {note.audio_path ? (
            <span className="nb-chip nb-chip-voice">
              <NoteIcon name="mic" size={12} />
              сказано голосом
            </span>
          ) : null}
          {note.pinned ? (
            <span className="nb-chip">
              <NoteIcon name="pin" size={12} />
              закреплена
            </span>
          ) : null}
          {reminder ? (
            <span className="nb-chip nums" data-tone={ringing ? "warn" : "quiet"}>
              <NoteIcon name="bell" size={12} />
              {reminder}
            </span>
          ) : null}
        </div>

        {note.audio_path ? (
          <div className="nb-voice">
            <AudioOriginal path={note.audio_path} />
            {edited ? <Original raw={raw} /> : null}
          </div>
        ) : null}

        {wordless ? (
          listening ? (
            <p className="nb-hearing" data-testid="desk-note-hearing">
              <span aria-hidden className="nb-hearing-dot" />
              Распознаю… голос сохранён
            </p>
          ) : (
            <div className="nb-unheard">
              <span>Не расслышал — голос сохранён. Впишите текст сами или распознайте ещё раз</span>
              <Button size="sm" variant="secondary" icon={<NoteIcon name="retry" size={14} />} onClick={() => dictation.retranscribe(note)} data-testid="desk-note-retranscribe">
                Распознать ещё раз
              </Button>
            </div>
          )
        ) : null}

        <PageEditor
          key={note.id}
          text={note.text}
          voice={note.audio_path !== null}
          onDirty={setDirty}
          onEscape={backToList}
          onSave={(text) => {
            setSaved(true);
            update.mutate({ id: note.id, text });
          }}
        />
      </div>

      {/* the sheets are born when asked for: an arrow through the list mounts none of them */}
      {mine === "assign" ? <AssignSheet note={note} onClose={close} me={me} /> : null}
      {mine === "remind-custom" ? <RemindSheet open onClose={close} currentIso={note.remind_at} onPick={(iso) => actions.remind([note], iso)} /> : null}
      {mine === "board-all" ? (
      <BoardPicker
        open
        onClose={close}
        subject={firstLine(note.text)}
        boards={liveBoards}
        summaries={summaries}
        onPick={(board) => {
          close();
          actions.toBoard([note], { id: board.id, title: board.title, fresh: false });
        }}
        onNew={() => {
          close();
          actions.toNewBoard([note]);
        }}
      />
      ) : null}
      <Menu
        open={mine === "remind" && remindEl !== null}
        onClose={close}
        anchor={remindEl}
        align="start"
        width={232}
        label="Напомнить"
        items={remindItems(now, note.remind_at, (iso) => actions.remind([note], iso), () => setIntent({ id: note.id, kind: "remind-custom" }))}
      />
      <Menu
        open={mine === "board" && boardEl !== null}
        onClose={close}
        anchor={boardEl}
        align="start"
        width={280}
        label="На доску"
        items={boardItems(
          liveBoards,
          (target) => actions.toBoard([note], target),
          () => setIntent({ id: note.id, kind: "board-all" }),
          () => actions.toNewBoard([note]),
        )}
      />
      <Menu open={mine === "more" && moreEl !== null} onClose={close} anchor={moreEl} align="end" width={300} label="Ещё" items={moreItems} />
      <Menu
        open={mine === "split" && moreEl !== null}
        onClose={close}
        anchor={moreEl}
        align="end"
        width={300}
        label="Разложить на доску"
        header={<p className="text-[12px] leading-4 text-muted">Каждая строка — пункт, заметка — в корзину</p>}
        items={boardItems(
          liveBoards,
          (target) => actions.split(note, target),
          () => setIntent({ id: note.id, kind: "board-all" }),
          () => actions.split(note, "new"),
        ).filter((item) => item === "separator" || item.key !== "all")}
      />
    </div>
  );
}

/**
 * The text of a note as a page (D-177): the first line set as a title, the rest as the body —
 * two fields over one plain text (D-75), Enter in the title starts the body, Backspace at the
 * body's start joins them back. Saved on a pause, on leaving and on Ctrl+S. Words that come
 * from outside — the recognised voice, an edit on the phone — land while nothing typed here is
 * waiting to be saved. Words typed and not saved yet hold an app update (D-115).
 */
function PageEditor({
  text,
  voice,
  onSave,
  onDirty,
  onEscape,
}: {
  text: string;
  voice: boolean;
  onSave: (text: string) => void;
  onDirty: (dirty: boolean) => void;
  onEscape: () => void;
}) {
  const [draft, setDraft] = useState(text);
  const [typing, setTyping] = useState(false);
  const [seen, setSeen] = useState(text);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const hold = useRef<(() => void) | null>(null);
  const last = useRef(text);
  const title = useRef<HTMLTextAreaElement>(null);
  const body = useRef<HTMLTextAreaElement>(null);
  const caret = useRef<{ field: "title" | "body"; at: number } | null>(null);

  // words from outside: taken while nothing typed here waits — never over the director's own
  if (text !== seen) {
    setSeen(text);
    if (!typing && text !== draft) setDraft(text);
  }
  useEffect(() => {
    if (!typing) last.current = text;
  }, [text, typing]);

  const cut = draft.indexOf("\n");
  const head = cut < 0 ? draft : draft.slice(0, cut);
  const rest = cut < 0 ? "" : draft.slice(cut + 1);

  // as tall as their text: the column scrolls, never a field
  useLayoutEffect(() => {
    for (const node of [title.current, body.current]) {
      if (!node) continue;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    }
    const want = caret.current;
    if (want) {
      caret.current = null;
      const node = want.field === "title" ? title.current : body.current;
      node?.focus();
      node?.setSelectionRange(want.at, want.at);
    }
  }, [draft]);

  const save = (next: string) => {
    hold.current?.();
    hold.current = null;
    pending.current = null;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setTyping(false);
    onDirty(false);
    if (next.trim() && next !== last.current) {
      last.current = next;
      onSave(next);
    }
  };
  // leaving the note mid-pause still saves what was typed
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  });
  useEffect(
    () => () => {
      if (pending.current !== null) saveRef.current(pending.current);
    },
    [],
  );

  const schedule = (next: string) => {
    setDraft(next);
    setTyping(true);
    pending.current = next;
    hold.current ??= holdUpdate();
    onDirty(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS);
  };

  const join = (h: string, b: string, keepBreak: boolean) => (keepBreak || b ? `${h}\n${b}` : h);

  const common = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.ctrlKey || event.metaKey) && event.code === "KeyS") {
      event.preventDefault();
      save(pending.current ?? draft);
      return true;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      if (pending.current !== null) save(pending.current);
      onEscape();
      return true;
    }
    return false;
  };

  const onBlur = () => {
    if (pending.current !== null) save(pending.current);
  };

  return (
    <div
      className="nb-page"
      onMouseDown={(event) => {
        // a click under the text goes into its end
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        const node = body.current;
        node?.focus();
        node?.setSelectionRange(node.value.length, node.value.length);
      }}
    >
      <textarea
        ref={title}
        value={head}
        rows={1}
        spellCheck
        aria-label="Первая строка заметки"
        placeholder={voice ? "Слова голоса появятся здесь" : "Первая строка — заголовок"}
        data-testid="note-title"
        data-update-safe
        className="nb-title-field no-bar"
        onChange={(event) => schedule(join(event.target.value, rest, cut >= 0))}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (common(event)) return;
          const node = event.currentTarget;
          if (event.key === "Enter" && !event.nativeEvent.isComposing) {
            // Enter in the title starts the body: the words after the caret go down with it
            event.preventDefault();
            const at = node.selectionStart;
            caret.current = { field: "body", at: 0 };
            schedule(`${head.slice(0, at)}\n${head.slice(node.selectionEnd)}${cut >= 0 ? `\n${rest}` : ""}`);
            return;
          }
          if (event.key === "ArrowDown" && node.selectionStart === head.length && node.selectionEnd === head.length) {
            event.preventDefault();
            body.current?.focus();
            body.current?.setSelectionRange(0, 0);
          }
        }}
      />
      <textarea
        ref={body}
        value={rest}
        rows={1}
        spellCheck
        aria-label="Текст заметки"
        placeholder={head ? "Пишите прямо здесь — сохраняется само" : ""}
        data-testid="note-editor"
        data-update-safe
        className="nb-body-field no-bar"
        onChange={(event) => schedule(join(head, event.target.value, true))}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (common(event)) return;
          const node = event.currentTarget;
          const atStart = node.selectionStart === 0 && node.selectionEnd === 0;
          if (event.key === "Backspace" && atStart) {
            // the body's first line joins the title back
            event.preventDefault();
            caret.current = { field: "title", at: head.length };
            schedule(`${head}${rest}`);
            return;
          }
          if (event.key === "ArrowUp" && atStart) {
            event.preventDefault();
            title.current?.focus();
            title.current?.setSelectionRange(head.length, head.length);
          }
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------- other kinds of note */

/** The words of a note as a read-only page: the first line a title, the rest as written. */
function ReadPage({ note }: { note: Note }) {
  const head = firstLine(note.text);
  const rest = restLines(note.text);
  return (
    <div className="nb-page nb-page-read">
      <p className="nb-title-field">{head || "Без текста"}</p>
      {rest ? <p className="nb-body-field whitespace-pre-line">{rest}</p> : null}
    </div>
  );
}

/** A note that became a task or an announcement: what it became, and its words as they were. */
function Converted({ note }: { note: Note }) {
  const { me, now, actions } = useNotesDesk();
  const sent = useSentTasks(note.converted_task_id ? me?.userId : undefined);
  const task = note.converted_task_id ? sent.data?.find((row) => row.id === note.converted_task_id) : undefined;
  const who = task?.assignee?.full_name ?? null;
  return (
    <div className="nb-doc-wrap" data-testid="desk-note">
      <div className="nb-bar">
        {note.converted_task_id ? (
          <Link href={`/desk/tasks?id=${note.converted_task_id}`} className="nb-bar-link desk-focus" data-testid="desk-note-task">
            Открыть задачу
            <span aria-hidden>›</span>
          </Link>
        ) : (
          <Link href="/desk/ether" className="nb-bar-link desk-focus">
            Эфир
            <span aria-hidden>›</span>
          </Link>
        )}
        <span className="ml-auto" />
        <IconButton label="Скопировать текст" icon={<NoteIcon name="copy" size={16} />} onClick={() => actions.copy(note)} />
      </div>
      <div className="nb-doc">
        <div className="nb-chips">
          <span className="nb-chip">
            <NoteIcon name={note.converted_task_id ? "task" : "megaphone"} size={12} />
            {note.converted_task_id ? "стала задачей" : "стала объявлением"}
          </span>
          {who ? <span className="nb-chip">{who}</span> : null}
          {task ? <span className="nb-chip">{SHORT_STATUS[task.status]}</span> : null}
          <span className="nb-chip">
            <When>{whenRu(note.converted_at ?? note.created_at, now)}</When>
          </span>
        </div>
        {note.audio_path ? (
          <div className="nb-voice">
            <AudioOriginal path={note.audio_path} />
          </div>
        ) : null}
        <ReadPage note={note} />
      </div>
    </div>
  );
}

/** A note moved onto a board meanwhile: it lives there now. */
function OnBoard({ note }: { note: Note }) {
  const { boards } = useNotesDesk();
  const board = boards.find((row) => row.id === note.board_id);
  return (
    <Quiet title={board ? `Пункт доски «${board.title}»` : "Пункт доски"} hint={firstLine(note.text)}>
      {board ? (
        <Link href={`/desk/boards/${board.id}`} className="nb-quiet-link desk-focus">
          Открыть доску ›
        </Link>
      ) : null}
    </Quiet>
  );
}

/** A deleted note opened from the bin or by its address: the way back, and the way out for good. */
function Trashed({ note }: { note: Note }) {
  const { now, actions } = useNotesDesk();
  const left = Math.max(0, Math.ceil((trashExpiresAt(note).getTime() - now.getTime()) / 86_400_000));
  return (
    <div className="nb-doc-wrap" data-testid="desk-note">
      <div className="nb-bar">
        <Button size="sm" icon={<NoteIcon name="restore" size={15} />} onClick={() => actions.restore(note)} data-testid="desk-note-restore">
          Вернуть в мысли
        </Button>
        <span className="ml-auto" />
        <Button size="sm" variant="ghost" className="nb-purge" onClick={() => actions.purge([note])} data-testid="desk-note-purge">
          Удалить навсегда
        </Button>
      </div>
      <div className="nb-doc">
        <div className="nb-chips">
          <span className="nb-chip" data-tone="danger">
            <NoteIcon name="trash" size={12} />в корзине
          </span>
          <span className="nb-chip">
            <When>удалена {whenRu(note.deleted_at ?? note.updated_at, now)}</When>
          </span>
          <span className="nb-chip">{left <= 1 ? "исчезнет завтра" : `исчезнет через ${left} ${pluralRu(left, ["день", "дня", "дней"])}`}</span>
        </div>
        {note.audio_path ? (
          <div className="nb-voice">
            <AudioOriginal path={note.audio_path} />
          </div>
        ) : null}
        <ReadPage note={note} />
      </div>
    </div>
  );
}

/* --------------------------------------------------------- several at once */

/** Several notes chosen: one bar for all of them — «На доску ▾», «Напомнить ▾», «В корзину». */
function Picked() {
  const { rows, picked, now, liveBoards, summaries, intent, setIntent, actions, clearPicked, tab } = useNotesDesk();
  const [boardEl, setBoardEl] = useState<HTMLButtonElement | null>(null);
  const [remindEl, setRemindEl] = useState<HTMLButtonElement | null>(null);
  const list = rows.filter((note) => picked.has(note.id));
  const thoughts = list.filter(isThought);
  const mine = intent?.id === "picked" ? intent.kind : null;
  const close = () => setIntent(null);
  const open = (kind: Intent["kind"]) => setIntent(mine === kind ? null : { id: "picked", kind });
  const inBin = tab === "trash";

  return (
    <div className="nb-doc-wrap" data-testid="desk-notes-picked">
      <div className="nb-bar">
        <span className="nb-picked-count nums">
          {list.length} {pluralRu(list.length, ["выбрана", "выбраны", "выбрано"])}
        </span>
        {inBin ? (
          <>
            <Button
              size="sm"
              icon={<NoteIcon name="restore" size={15} />}
              onClick={() => {
                for (const note of list) actions.restore(note);
                clearPicked();
              }}
            >
              Вернуть все
            </Button>
            <span className="ml-auto" />
            <Button size="sm" variant="ghost" className="nb-purge" onClick={() => actions.purge(list)}>
              Удалить навсегда
            </Button>
          </>
        ) : (
          <>
            <BarButton label="На доску" keys={["B"]} icon={<NoteIcon name="board" size={15} />} open={mine === "board"} onOpen={() => open("board")} anchorRef={setBoardEl} disabled={thoughts.length === 0} testId="desk-picked-board">
              На доску
            </BarButton>
            <BarButton label="Напомнить" keys={["R"]} icon={<NoteIcon name="bell" size={15} />} open={mine === "remind"} onOpen={() => open("remind")} anchorRef={setRemindEl} disabled={thoughts.length === 0} testId="desk-picked-remind">
              Напомнить
            </BarButton>
            <span className="ml-auto" />
            <Button size="sm" variant="ghost" className="nb-purge" icon={<NoteIcon name="trash" size={15} />} onClick={() => actions.binMany(list)} data-testid="desk-picked-bin">
              В корзину
            </Button>
          </>
        )}
      </div>
      <div className="nb-doc">
        <p className="nb-picked-title">
          {inBin ? "Выбрано в корзине" : "Выбрано несколько мыслей"} <span className="nb-picked-keys">Esc — снять выбор</span>
        </p>
        <ul className="nb-picked-list">
          {list.slice(0, PICKED_SHOWN).map((note) => (
            <li key={note.id}>{firstLine(note.text) || "Голосовая заметка"}</li>
          ))}
          {list.length > PICKED_SHOWN ? <li className="nb-picked-more">и ещё {list.length - PICKED_SHOWN}</li> : null}
        </ul>
      </div>
      <BoardPicker
        open={mine === "board-all"}
        onClose={close}
        subject={`${thoughts.length} ${pluralRu(thoughts.length, ["мысль", "мысли", "мыслей"])}`}
        boards={liveBoards}
        summaries={summaries}
        onPick={(board) => {
          close();
          actions.toBoard(thoughts, { id: board.id, title: board.title, fresh: false });
        }}
        onNew={() => {
          close();
          actions.toNewBoard(thoughts);
        }}
      />
      <RemindSheet open={mine === "remind-custom"} onClose={close} currentIso={null} onPick={(iso) => actions.remind(thoughts, iso)} />
      <Menu
        open={mine === "board" && boardEl !== null}
        onClose={close}
        anchor={boardEl}
        align="start"
        width={280}
        label="На доску"
        items={boardItems(
          liveBoards,
          (target) => actions.toBoard(thoughts, target),
          () => setIntent({ id: "picked", kind: "board-all" }),
          () => actions.toNewBoard(thoughts),
        )}
      />
      <Menu
        open={mine === "remind" && remindEl !== null}
        onClose={close}
        anchor={remindEl}
        align="start"
        width={232}
        label="Напомнить"
        items={remindItems(now, null, (iso) => actions.remind(thoughts, iso), () => setIntent({ id: "picked", kind: "remind-custom" }))}
      />
    </div>
  );
}
