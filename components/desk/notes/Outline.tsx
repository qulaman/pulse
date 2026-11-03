"use client";

import Link from "next/link";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";

import { useContextMenu, type MenuItem } from "@/components/desk/ui/Menu";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR } from "@/components/desk/ui/tone";
import { SketchView } from "@/components/mindboard/SketchView";
import { NoteIcon } from "@/components/notes/icons";
import { toast } from "@/components/ui/Toast";
import { demotedPlace, promotedPlace } from "@/lib/mindboard/branch";
import { hasContent, isDrawn, sketchFrom } from "@/lib/mindboard/sketch";
import { splitList, type SplitPoint } from "@/lib/mindboard/split";
import { branchesOf } from "@/lib/mindboard/tree";
import type { NoteFields } from "@/lib/notes/pending";
import type { Note } from "@/lib/notes/queries";
import { shortName } from "@/lib/people/names";
import type { TaskWithPeople } from "@/lib/tasks/queries";
import { SHORT_STATUS, isOverdue } from "@/lib/tasks/status-text";
import { toneOf } from "@/lib/tasks/tone";
import { holdUpdate } from "@/lib/update/client";

import { childrenOf, draftAfter, draftIndented, draftOutdented, draftPlace, dropPlace, siblingsOf, stepPlace, type Draft } from "./outlinePlaces";

/** A pause in typing this long saves the line. */
const SAVE_DEBOUNCE_MS = 600;

/** What the outline asks of the board: every write is one call, the board decides how it travels. */
export type OutlineActions = {
  /** A line got its words: a new note at its place. */
  create: (row: { id: string; text: string; parent_id: string | null; position: number }) => void;
  /** Text, a tick, a place, a branch — one row written. */
  edit: (row: Note, fields: NoteFields) => void;
  /** To the bin, with its sub-points; the toast brings it back. */
  remove: (row: Note) => void;
  /** «Поручить…» — the people dialog over the board. */
  assign: (row: Note) => void;
  /** «На другую доску…». */
  move: (row: Note) => void;
  /** The point lit on the wall, or the light off. */
  spotlight: (pointId: string | null) => void;
  /** «Рисунок…» of a point: the drawing pad. */
  sketch: (row: Note) => void;
  /** A pasted list as lines: at the end, after a point, or as sub-points of a point. */
  writeMany: (points: SplitPoint[], at: { parent?: string; after?: string }) => void;
};

type Props = {
  /** Live lines of the board: the cache, edits still on the phone, lines only on the phone, lines just typed here. */
  rows: Note[];
  /** Only on the phone so far: nothing to edit or move until they land. */
  phone: ReadonlySet<string>;
  /** Their words are on the way from STT right now. */
  hearing: ReadonlySet<string>;
  /** The numbers the wall gives the points. */
  numbers: Map<string, number>;
  /** The point lit on the wall; null — none. */
  spot: string | null;
  /** The board is on the wall: a point can be lit from its menu. */
  onWall: boolean;
  taskOf: (row: Note) => TaskWithPeople | undefined;
  actions: OutlineActions;
  /** The board has nothing yet: the first line is ready to be typed. */
  autoStart: boolean;
};

type Caret = "start" | "end" | number;
/**
 * Where the caret is asked to go once the line is on screen. `until` — a line moved in the
 * outline (Tab, a step): the move lands a moment later and may draw the line anew, so the caret
 * is put back until then; without it — once.
 */
type FocusRequest = { id: string; caret: Caret; until: number | null };
/** How long a moved line keeps getting its caret back. */
const STICKY_MS = 1500;
/** A new line is drawn in the same render: its caret comes within this. */
const SOON_MS = 400;

/**
 * A structural change moves the focused field in the page (it may be drawn anew): its blur is
 * not the person leaving it. One outline is on screen at a time, so one hold for all; it melts
 * by itself, a stuck hold can never keep a draft from being kept.
 */
const blurHold = { until: 0 };
const holdBlurFor = (ms: number) => {
  blurHold.until = Date.now() + ms;
};
const blurHeld = () => Date.now() < blurHold.until;
/** Drafts already handed to the server: a late blur must not send one twice. */
const sentDrafts = new Set<string>();
/** Till when a moved line keeps getting its caret back. */
const stickyUntil = () => Date.now() + STICKY_MS;
const releaseBlur = () => {
  blurHold.until = 0;
};

/**
 * The board as an outline on the desk (wave 3, D-121): a point and its sub-points one level deep,
 * typed and moved without the mouse — Enter makes the next line (after a point with sub-points —
 * its first sub-point), Tab makes a point a sub-point of the one above and Shift+Tab takes it
 * back out, ↑/↓ walk the lines, Ctrl+Enter ticks, Ctrl+Shift+↑/↓ move a line, Backspace in an
 * empty line removes it, a pasted list becomes lines. The mouse has the same: a click into any
 * line, the circle ticks, the handle drags a point with its branch (a sub-point within its
 * point), «⋯» and a right click open the line's menu. A new line is a draft until it has words.
 */
export function Outline({ rows, phone, hearing, numbers, spot, onWall, taskOf, actions, autoStart }: Props) {
  const branches = useMemo(() => branchesOf(rows), [rows]);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const [draft, setDraft] = useState<Draft | null>(() => (autoStart ? { id: crypto.randomUUID(), parent: null, after: null, text: "" } : null));
  const want = useRef<FocusRequest | null>(null);
  const menu = useContextMenu();
  const box = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{ id: string; index: number } | null>(null);

  /** Every line on screen in order, the draft included: what ↑/↓ walk. */
  const order = useMemo(() => {
    const out: string[] = [];
    let placed = false;
    const put = () => {
      if (draft && !placed) {
        out.push(draft.id);
        placed = true;
      }
    };
    for (const { point, children } of branches) {
      out.push(point.id);
      if (draft?.parent === point.id && draft.after === null) put();
      for (const child of children) {
        out.push(child.id);
        if (draft?.parent === point.id && draft.after === child.id) put();
      }
      if (draft?.parent === point.id) put();
      if (draft && draft.parent === null && draft.after === point.id) put();
    }
    put();
    return out;
  }, [branches, draft]);

  /** Puts the caret into a line on screen; false — the line is not drawn (yet). */
  const place = (request: FocusRequest): boolean => {
    const field = box.current?.querySelector<HTMLTextAreaElement>(`textarea[data-line="${request.id}"]`);
    if (!field) return false;
    if (document.activeElement === field && request.until !== null) return true;
    field.focus({ preventScroll: false });
    const at = request.caret === "start" ? 0 : request.caret === "end" ? field.value.length : Math.min(request.caret, field.value.length);
    field.setSelectionRange(at, at);
    return true;
  };

  // the caret goes where it was asked as soon as the line is on screen
  useLayoutEffect(() => {
    const request = want.current;
    if (!request) return;
    if (request.until !== null && Date.now() > request.until) {
      want.current = null;
      return;
    }
    if (!place(request) || request.until !== null) return;
    want.current = null;
    releaseBlur();
  });
  // a new board starts with its first line ready
  useEffect(() => {
    if (draft && autoStart) place({ id: draft.id, caret: "end", until: null });
    // only on arrival
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** The caret into a line: now if it is on screen, else as soon as it is drawn; `moved` — keep putting it back a while. */
  const focusLine = (id: string | null, caret: Caret, moved = false) => {
    if (!id) return;
    const request: FocusRequest = { id, caret, until: moved ? stickyUntil() : null };
    if (moved) {
      holdBlurFor(STICKY_MS);
      want.current = request;
      return;
    }
    if (place(request)) return;
    holdBlurFor(SOON_MS);
    want.current = request;
  };
  const canHold = (id: string) => !phone.has(id) && rowById.get(id)?.parent_id === null;

  /** A draft with words becomes a note at its place; the next draft follows it at the same level. */
  const commit = (current: Draft, text: string, next: boolean) => {
    if (sentDrafts.has(current.id)) return;
    sentDrafts.add(current.id);
    const place = draftPlace(rows, current);
    actions.create({ id: current.id, text, ...place });
    if (!next) {
      setDraft((was) => (was && was.id === current.id ? null : was));
      return;
    }
    startDraft({ id: crypto.randomUUID(), parent: place.parent_id, after: current.id, text: "" });
  };

  /**
   * A draft drawn where it stands now; the caret goes into it once it is drawn — a draft that
   * changed its place may be a new field on the page.
   */
  const startDraft = (next: Draft, caret: Caret = "start") => {
    holdBlurFor(SOON_MS);
    setDraft(next);
    want.current = { id: next.id, caret, until: null };
  };

  /**
   * The person left the draft: with words it is kept, without — it goes. A tick later: a move of
   * the outline draws the draft anew and puts the caret back into it — that is not leaving.
   */
  const leaveDraft = (current: Draft, text: string) => {
    setTimeout(() => {
      if (sentDrafts.has(current.id) || document.activeElement?.getAttribute("data-line") === current.id) return;
      if (text.trim()) commit(current, text.trim(), false);
      else setDraft((was) => (was && was.id === current.id ? null : was));
    }, 0);
  };

  const removeRow = (row: Note) => {
    const at = order.indexOf(row.id);
    actions.remove(row);
    focusLine(order[at - 1] ?? order[at + 1] ?? null, "end");
  };

  const toggle = (row: Note) => actions.edit(row, { done_at: row.done_at ? null : new Date().toISOString() });

  const indent = (row: Note) => {
    if (phone.has(row.id)) return;
    if (row.parent_id !== null && rowById.has(row.parent_id)) {
      toast("Глубже подпункта не бывает — один уровень");
      return;
    }
    const to = isDrawn(row.sketch) ? null : demotedPlace(rows, row.id, canHold);
    if (!to) {
      const first = branches[0]?.point.id === row.id;
      toast(first ? "Первый пункт не сделать подпунктом" : childrenOf(rows, row.id).length > 0 ? "У пункта свои подпункты — подпунктом его не сделать" : isDrawn(row.sketch) ? "Рисунок остаётся пунктом" : "Пункт выше ещё не доехал — чуть позже");
      return;
    }
    holdBlurFor(STICKY_MS);
    actions.edit(row, to);
  };
  const outdent = (row: Note) => {
    if (phone.has(row.id)) return;
    const to = promotedPlace(rows, row.id);
    if (!to) return;
    holdBlurFor(STICKY_MS);
    actions.edit(row, to);
  };
  const step = (row: Note, direction: -1 | 1) => {
    if (phone.has(row.id)) return;
    const position = stepPlace(rows, row, direction);
    if (position === null) return;
    holdBlurFor(STICKY_MS);
    actions.edit(row, { position });
  };

  /** The keys of a line: the outline's own; the rest is typing. */
  const onRowKey = (row: Note, event: KeyboardEvent<HTMLTextAreaElement>, api: LineApi) => {
    const field = event.currentTarget;
    const value = field.value;
    const caret = field.selectionStart;
    const plainEnter = (event.code === "Enter" || event.code === "NumpadEnter") && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
    if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter")) {
      event.preventDefault();
      toggle(row);
    } else if (plainEnter) {
      event.preventDefault();
      if (phone.has(row.id)) return;
      const id = crypto.randomUUID();
      const next = draftAfter(rows, row, id);
      // the caret inside the words splits the line: what is after it becomes the next line
      if (caret > 0 && caret < value.length && value.slice(0, caret).trim() && value.slice(caret).trim()) {
        api.keep(value.slice(0, caret).trimEnd());
        holdBlurFor(SOON_MS);
        actions.create({ id, text: value.slice(caret).trimStart(), ...draftPlace(rows, next) });
        focusLine(id, "start");
        return;
      }
      api.flush();
      startDraft(next);
    } else if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      api.flush();
      focusLine(row.id, caret, true);
      if (event.shiftKey) outdent(row);
      else indent(row);
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && (event.code === "ArrowUp" || event.code === "ArrowDown")) {
      event.preventDefault();
      api.flush();
      focusLine(row.id, caret, true);
      step(row, event.code === "ArrowUp" ? -1 : 1);
    } else if (event.code === "ArrowUp" && !event.shiftKey && !event.altKey && !value.slice(0, caret).includes("\n")) {
      const above = order[order.indexOf(row.id) - 1];
      if (!above) return;
      event.preventDefault();
      focusLine(above, "end");
    } else if (event.code === "ArrowDown" && !event.shiftKey && !event.altKey && !value.slice(caret).includes("\n")) {
      const below = order[order.indexOf(row.id) + 1];
      if (!below) return;
      event.preventDefault();
      focusLine(below, "start");
    } else if (event.code === "Backspace" && !value && !phone.has(row.id) && !isDrawn(row.sketch) && !row.audio_path) {
      // only a line with nothing in it goes this way: a drawing or a voice keeps its line
      event.preventDefault();
      api.keep(row.text);
      removeRow(row);
    } else if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.code === "Backspace" && !phone.has(row.id)) {
      event.preventDefault();
      api.keep(row.text);
      removeRow(row);
    }
  };

  const onDraftKey = (current: Draft, event: KeyboardEvent<HTMLTextAreaElement>) => {
    const field = event.currentTarget;
    const text = field.value;
    const plainEnter = (event.code === "Enter" || event.code === "NumpadEnter") && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey;
    if (plainEnter) {
      event.preventDefault();
      if (text.trim()) commit(current, text.trim(), true);
      else if (current.parent !== null) {
        // Enter in an empty sub-point steps out: the next point, as in any outliner
        const out = draftOutdented(current);
        if (out) startDraft(out);
      }
    } else if (event.code === "Tab" && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const next = event.shiftKey ? draftOutdented(current) : draftIndented(rows, current, canHold);
      if (next) startDraft({ ...next, text }, field.selectionStart);
      else if (!event.shiftKey && current.parent !== null) toast("Глубже подпункта не бывает — один уровень");
    } else if (event.code === "ArrowUp" && !event.shiftKey && !text.slice(0, field.selectionStart).includes("\n")) {
      const above = order[order.indexOf(current.id) - 1];
      if (!above) return;
      event.preventDefault();
      if (!text.trim()) setDraft(null);
      focusLine(above, "end");
    } else if (event.code === "ArrowDown" && !event.shiftKey && !text.slice(field.selectionStart).includes("\n")) {
      const below = order[order.indexOf(current.id) + 1];
      if (!below) return;
      event.preventDefault();
      if (!text.trim()) setDraft(null);
      focusLine(below, "start");
    } else if (event.code === "Backspace" && !text) {
      event.preventDefault();
      const above = order[order.indexOf(current.id) - 1] ?? null;
      setDraft(null);
      focusLine(above, "end");
    }
  };

  /** A pasted list into an empty line: every line of it becomes a line of the board, in place. */
  const onPasteInto = (at: { parent: string | null; after: string | null }, event: ClipboardEvent<HTMLTextAreaElement>, empty: boolean) => {
    if (!empty) return false;
    const points = splitList(event.clipboardData.getData("text"));
    if (!points) return false;
    event.preventDefault();
    if (at.parent) actions.writeMany([{ text: "", children: points.flatMap((point) => [point.text, ...point.children]).filter((text) => text.trim()) }], { parent: at.parent });
    else actions.writeMany(points, at.after ? { after: at.after } : {});
    return true;
  };

  const lineMenu = (row: Note): MenuItem[] => {
    const sub = row.parent_id !== null && rowById.has(row.parent_id);
    const onPhone = phone.has(row.id);
    const lightable = onWall && !sub && hasContent(row) && !onPhone;
    return [
      { key: "done", label: row.done_at ? "Снять отметку" : "Отметить", hint: "Ctrl Enter", disabled: onPhone, onSelect: () => toggle(row) },
      sub
        ? { key: "out", label: "Вынести в пункты", hint: "Shift Tab", disabled: onPhone, onSelect: () => outdent(row) }
        : { key: "in", label: "Сделать подпунктом", hint: "Tab", disabled: onPhone || branches[0]?.point.id === row.id, onSelect: () => indent(row) },
      { key: "up", label: "Выше", hint: "Ctrl Shift ↑", disabled: onPhone || stepPlace(rows, row, -1) === null, onSelect: () => step(row, -1) },
      { key: "down", label: "Ниже", hint: "Ctrl Shift ↓", disabled: onPhone || stepPlace(rows, row, 1) === null, onSelect: () => step(row, 1) },
      "separator",
      ...(row.converted_task_id === null && row.text.trim() && !onPhone ? [{ key: "assign", label: "Поручить…", icon: <NoteIcon name="task" size={14} />, onSelect: () => actions.assign(row) }] : []),
      ...(lightable ? [{ key: "spot", label: spot === row.id ? "Снять подсветку на стене" : "Показать на стене", icon: <NoteIcon name="wall" size={14} />, onSelect: () => actions.spotlight(spot === row.id ? null : row.id) }] : []),
      ...(!sub && !onPhone ? [{ key: "sketch", label: isDrawn(row.sketch) ? "Дорисовать…" : "Рисунок к пункту…", icon: <NoteIcon name="pencil" size={14} />, onSelect: () => actions.sketch(row) }] : []),
      ...(!sub && !onPhone ? [{ key: "move", label: "На другую доску…", icon: <NoteIcon name="move" size={14} />, onSelect: () => actions.move(row) }] : []),
      "separator",
      { key: "bin", label: "В корзину", hint: "Ctrl Shift ⌫", danger: true, disabled: onPhone, icon: <NoteIcon name="trash" size={14} />, onSelect: () => removeRow(row) },
    ];
  };

  // the handle: a point is dragged with its branch among the points, a sub-point within its point
  const startDrag = (row: Note, event: ReactPointerEvent<HTMLButtonElement>) => {
    if (phone.has(row.id) || event.button !== 0) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const siblings = siblingsOf(rows, row);
    const from = siblings.findIndex((other) => other.id === row.id);
    const sub = row.parent_id !== null && rowById.has(row.parent_id);
    const blocks = () =>
      siblings
        .filter((other) => other.id !== row.id)
        .map((other) => box.current?.querySelector<HTMLElement>(sub ? `[data-line-box="${other.id}"]` : `[data-branch="${other.id}"]`)?.getBoundingClientRect() ?? null);
    let index = from;
    setDrag({ id: row.id, index });
    const move = (moveEvent: PointerEvent) => {
      const rects = blocks();
      let next = 0;
      rects.forEach((rect, at) => {
        if (rect && moveEvent.clientY > rect.top + rect.height / 2) next = at + 1;
      });
      if (next !== index) {
        index = next;
        setDrag({ id: row.id, index });
      }
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      setDrag(null);
      const position = dropPlace(rows, row, index);
      if (position !== null) actions.edit(row, { position });
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  };

  // the draft, drawn in whichever slot it stands in
  const draftNode = draft ? (
    <DraftLine
      key={draft.id}
      draft={draft}
      sub={draft.parent !== null}
      onText={(text) => setDraft((was) => (was ? { ...was, text } : was))}
      onKey={(event) => onDraftKey(draft, event)}
      onPaste={(event) => {
        if (onPasteInto({ parent: draft.parent, after: draft.parent ? null : draft.after }, event, !draft.text)) setDraft(null);
      }}
      onLeave={(text) => leaveDraft(draft, text)}
    />
  ) : null;

  /** Where the drop line stands while a line is dragged: before the sibling at `index`. */
  const dropBefore = (siblingIds: string[]) => {
    if (!drag || !siblingIds.includes(drag.id)) return null;
    const others = siblingIds.filter((id) => id !== drag.id);
    return { before: others[drag.index] ?? null, end: drag.index >= others.length };
  };
  const pointDrop = dropBefore(branches.map((branch) => branch.point.id));

  const rowLine = (row: Note, level: 0 | 1) => {
    const task = taskOf(row);
    return (
      <LineRow
        key={row.id}
        row={row}
        level={level}
        n={level === 0 ? (numbers.get(row.id) ?? null) : null}
        lit={spot === row.id}
        onPhone={phone.has(row.id)}
        hearing={hearing.has(row.id)}
        task={task}
        dragging={drag?.id === row.id}
        onToggle={() => toggle(row)}
        onKey={(event, api) => onRowKey(row, event, api)}
        onSave={(text) => actions.edit(row, { text })}
        onPaste={(event) => {
          onPasteInto(level === 1 ? { parent: row.parent_id, after: null } : { parent: null, after: row.id }, event, !event.currentTarget.value);
        }}
        onGrip={(event) => startDrag(row, event)}
        onMenu={(event) => menu.open(event, lineMenu(row))}
        onSketch={() => actions.sketch(row)}
      />
    );
  };

  return (
    <div
      ref={box}
      className="flex flex-col"
      data-testid="desk-outline"
      // the person went to another line: a pending «put the caret back» is no longer wanted
      onFocusCapture={(event) => {
        const line = (event.target as HTMLElement).getAttribute?.("data-line");
        if (want.current && line && line !== want.current.id) {
          want.current = null;
          releaseBlur();
        }
      }}
    >
      {branches.map(({ point, children }) => {
        const subDrop = dropBefore(children.map((child) => child.id));
        return (
          <div key={point.id} data-branch={point.id} className={`relative ${drag?.id === point.id ? "opacity-40" : ""}`}>
            {pointDrop && pointDrop.before === point.id ? <DropLine /> : null}
            {rowLine(point, 0)}
            {draft?.parent === point.id && draft.after === null ? draftNode : null}
            {children.map((child) => (
              <div key={child.id} className="relative">
                {subDrop && subDrop.before === child.id ? <DropLine sub /> : null}
                {rowLine(child, 1)}
                {draft?.parent === point.id && draft.after === child.id ? draftNode : null}
              </div>
            ))}
            {subDrop?.end ? (
              <div className="relative h-0">
                <DropLine sub />
              </div>
            ) : null}
            {draft?.parent === point.id && draft.after !== null && !children.some((child) => child.id === draft.after) ? draftNode : null}
            {draft && draft.parent === null && draft.after === point.id ? draftNode : null}
          </div>
        );
      })}
      {pointDrop?.end ? (
        <div className="relative h-0">
          <DropLine />
        </div>
      ) : null}
      {draft && ((draft.parent === null && (draft.after === null || !rowById.has(draft.after))) || (draft.parent !== null && !rowById.has(draft.parent))) ? draftNode : null}

      {/* the way to a new point with the mouse: a quiet line under the last one */}
      {!draft || draft.parent !== null || draft.after !== null ? (
        <button
          type="button"
          onClick={() => {
            const last = branches[branches.length - 1]?.point ?? null;
            startDraft({ id: crypto.randomUUID(), parent: null, after: last?.id ?? null, text: "" });
          }}
          className="mt-1 flex h-9 items-center gap-2.5 rounded-[8px] pl-[38px] pr-2 text-left text-[14px] leading-5 text-muted transition-colors duration-[120ms] hover:bg-surface/60 hover:text-text"
          data-testid="desk-outline-add"
        >
          <NoteIcon name="plus" size={14} />
          Пункт
        </button>
      ) : null}
      {menu.node}
    </div>
  );
}

function DropLine({ sub = false }: { sub?: boolean }) {
  return <span aria-hidden className={`pointer-events-none absolute -top-px right-2 z-10 h-[2px] rounded-full bg-accent ${sub ? "left-[64px]" : "left-[30px]"}`} />;
}

/** What a line's own field hands its keys: keep these words (the line was split or removed), save now. */
type LineApi = { keep: (text: string) => void; flush: () => void };

/** A line of the board: the handle, the number or the circle, the words, what it became, its menu. */
function LineRow({
  row,
  level,
  n,
  lit,
  onPhone,
  hearing,
  task,
  dragging,
  onToggle,
  onKey,
  onSave,
  onPaste,
  onGrip,
  onMenu,
  onSketch,
}: {
  row: Note;
  level: 0 | 1;
  n: number | null;
  lit: boolean;
  onPhone: boolean;
  hearing: boolean;
  task: TaskWithPeople | undefined;
  dragging: boolean;
  onToggle: () => void;
  onKey: (event: KeyboardEvent<HTMLTextAreaElement>, api: LineApi) => void;
  onSave: (text: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onGrip: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  onMenu: (event: ReactMouseEvent) => void;
  onSketch: () => void;
}) {
  const done = row.done_at !== null;
  const sketch = level === 0 ? sketchFrom(row.sketch) : null;
  const voiceOnly = !row.text.trim() && Boolean(row.audio_path);
  const placeholder = onPhone ? "Ждёт сети…" : hearing ? "Распознаю голос…" : voiceOnly ? "Не расслышал — голос сохранён" : sketch ? "Подпись к рисунку" : "";
  return (
    <div
      data-line-box={row.id}
      onContextMenu={onMenu}
      className={`group relative flex items-start gap-1.5 rounded-[8px] py-[3px] pr-1 transition-colors duration-[120ms] hover:bg-surface/50 focus-within:bg-surface/70 ${level === 1 ? "pl-[34px]" : "pl-0"} ${dragging ? "bg-surface-2/60" : ""}`}
      style={lit ? { boxShadow: "inset 2px 0 0 var(--accent)", background: "color-mix(in srgb, var(--accent) 7%, transparent)" } : undefined}
      data-testid="desk-outline-line"
      data-level={level}
    >
      <button
        type="button"
        aria-label="Перетащить"
        tabIndex={-1}
        onPointerDown={onGrip}
        className="mt-[5px] flex h-6 w-5 shrink-0 cursor-grab items-center justify-center rounded-[5px] text-muted/60 opacity-0 transition-opacity duration-[120ms] hover:text-text active:cursor-grabbing group-hover:opacity-100"
      >
        <NoteIcon name="grip" size={13} />
      </button>
      <Tooltip label={done ? "Снять отметку" : "Отметить"} keys={["Ctrl", "Enter"]}>
        <button
          type="button"
          tabIndex={-1}
          role="checkbox"
          aria-checked={done}
          aria-label={done ? "Снять отметку" : "Отметить"}
          disabled={onPhone}
          onClick={onToggle}
          data-testid="desk-outline-check"
          className={`mt-[5px] flex shrink-0 items-center justify-center rounded-full border font-display font-bold leading-none transition-colors duration-[120ms] disabled:opacity-50 ${
            level === 0 ? "h-6 w-6 text-[12px]" : "mt-[7px] h-[18px] w-[18px] text-[10px]"
          } ${done ? "border-ok/70 bg-ok/15 text-ok" : lit ? "border-accent bg-accent/15 text-accent" : "border-border text-muted hover:border-muted hover:text-text"}`}
        >
          {done ? <NoteIcon name="check" size={level === 0 ? 13 : 11} /> : level === 0 && n !== null ? <span className="nums">{n}</span> : null}
        </button>
      </Tooltip>
      <div className="min-w-0 flex-1">
        <LineText
          id={row.id}
          text={row.text}
          readOnly={onPhone}
          placeholder={placeholder}
          className={`${level === 0 ? "text-[15px] font-semibold leading-[22px]" : "text-[14px] leading-[22px] text-text/90"} ${done ? "text-muted line-through decoration-muted/40" : ""}`}
          onKey={onKey}
          onSave={onSave}
          onPaste={onPaste}
        />
        {sketch ? (
          <button type="button" onClick={onSketch} className="mt-1 mb-1 ml-1 block h-20 w-36 overflow-hidden rounded-[8px] border border-border bg-bg/60 p-1 transition-colors duration-[120ms] hover:border-muted/60" title="Открыть рисунок">
            <SketchView sketch={sketch} />
          </button>
        ) : null}
      </div>
      {task ? <TaskPill task={task} /> : null}
      {lit ? <span className="mt-[7px] shrink-0 text-[11px] font-semibold leading-4 text-accent">на стене</span> : null}
      <button
        type="button"
        aria-label="Действия с пунктом"
        tabIndex={-1}
        onClick={onMenu}
        className="mt-[3px] flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-muted opacity-0 transition-opacity duration-[120ms] hover:bg-surface-2 hover:text-text focus-visible:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100"
        data-testid="desk-outline-menu"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </svg>
      </button>
    </div>
  );
}

/** «→ Айгуль · в работе» — what a handed point became; a click opens the task. */
function TaskPill({ task }: { task: TaskWithPeople }) {
  const tone = toneOf(task.status, isOverdue(task));
  return (
    <Link
      href={`/desk/tasks?id=${task.id}`}
      className="mt-[4px] inline-flex max-w-[220px] shrink-0 items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-[12px] leading-4 transition-colors duration-[120ms] hover:border-muted/60"
      title={`Задача: ${task.title}`}
    >
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />
      <span className="truncate">{shortName(task.assignee?.full_name) || "Исполнитель"}</span>
      <span className="shrink-0 text-muted">· {SHORT_STATUS[task.status]}</span>
    </Link>
  );
}

/** The new line being typed: no circle yet, a quiet placeholder; it becomes a note once it has words. */
function DraftLine({
  draft,
  sub,
  onText,
  onKey,
  onPaste,
  onLeave,
}: {
  draft: Draft;
  sub: boolean;
  onText: (text: string) => void;
  onKey: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onLeave: (text: string) => void;
}) {
  const field = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [draft.text]);
  return (
    <div className={`flex items-start gap-1.5 rounded-[8px] bg-surface/70 py-[3px] pr-1 ${sub ? "pl-[34px]" : "pl-0"}`} data-testid="desk-outline-draft">
      <span aria-hidden className="mt-[5px] h-6 w-5 shrink-0" />
      <span aria-hidden className={`mt-[5px] shrink-0 rounded-full border border-dashed border-accent/60 ${sub ? "mt-[7px] h-[18px] w-[18px]" : "h-6 w-6"}`} />
      <textarea
        ref={field}
        rows={1}
        value={draft.text}
        data-line={draft.id}
        onChange={(event) => onText(event.target.value)}
        onKeyDown={onKey}
        onPaste={onPaste}
        onBlur={(event) => onLeave(event.currentTarget.value)}
        placeholder={sub ? "Подпункт — Enter, Shift+Tab — в пункты" : "Пункт — Enter, Tab — подпункт"}
        aria-label={sub ? "Новый подпункт" : "Новый пункт"}
        className={`no-bar min-w-0 flex-1 resize-none bg-transparent px-1 py-[3px] outline-none placeholder:text-muted/70 ${sub ? "text-[14px] leading-[22px]" : "text-[15px] font-semibold leading-[22px] placeholder:font-normal"}`}
      />
      <span aria-hidden className="w-7 shrink-0" />
    </div>
  );
}

/**
 * The words of a line, typed in place: saved on a pause and on leaving, never empty (an emptied
 * line keeps its words — Backspace removes the line). While nobody types in it, it follows the
 * board: a word changed on the phone shows here.
 */
function LineText({
  id,
  text,
  readOnly,
  placeholder,
  className,
  onKey,
  onSave,
  onPaste,
}: {
  id: string;
  text: string;
  readOnly: boolean;
  placeholder: string;
  className: string;
  onKey: (event: KeyboardEvent<HTMLTextAreaElement>, api: LineApi) => void;
  onSave: (text: string) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
}) {
  const [value, setValue] = useState(text);
  const [base, setBase] = useState(text);
  const [typing, setTyping] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const hold = useRef<(() => void) | null>(null);
  const saved = useRef(text);

  // the board moved on while nobody typed here: the line shows what the board holds
  if (text !== base && !typing) {
    setBase(text);
    setValue(text);
  }
  useEffect(() => {
    if (!typing) saved.current = text;
  }, [text, typing]);

  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${node.scrollHeight}px`;
  }, [value]);

  const save = (next: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    pending.current = null;
    hold.current?.();
    hold.current = null;
    const clean = next.trim();
    if (clean && clean !== saved.current.trim()) {
      saved.current = next;
      onSave(clean);
    }
  };
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

  const api: LineApi = {
    keep: (words) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      pending.current = null;
      hold.current?.();
      hold.current = null;
      setValue(words);
      if (words.trim() && words.trim() !== saved.current.trim()) {
        saved.current = words;
        onSave(words.trim());
      }
    },
    flush: () => {
      if (pending.current !== null) save(pending.current);
    },
  };

  return (
    <textarea
      ref={field}
      rows={1}
      value={value}
      readOnly={readOnly}
      data-line={id}
      data-update-safe
      onFocus={() => setTyping(true)}
      onChange={(event) => {
        const next = event.target.value;
        setValue(next);
        pending.current = next;
        hold.current ??= holdUpdate();
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => save(next), SAVE_DEBOUNCE_MS);
      }}
      onKeyDown={(event) => onKey(event, api)}
      onPaste={onPaste}
      onBlur={(event) => {
        if (pending.current !== null) save(pending.current);
        // an emptied line keeps its words: Backspace in it is the way to remove it
        if (!event.currentTarget.value.trim() && saved.current.trim() && !blurHeld()) setValue(saved.current);
        setTyping(false);
      }}
      placeholder={placeholder}
      aria-label="Пункт"
      className={`no-bar block w-full resize-none bg-transparent px-1 py-[3px] outline-none placeholder:font-normal placeholder:text-muted/70 ${className}`}
    />
  );
}
