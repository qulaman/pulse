"use client";

import { useEffect, useMemo, useState, type RefObject } from "react";

import { useScreenKeys } from "@/components/desk/team/keys";
import { bulkPlan, firstChanged, inPlaceOf, pickedInOrder, pickRange, rowSignature, togglePick } from "@/lib/desk/tasks";
import type { BoardTask } from "@/lib/pulse/board";
import type { DirectorTab } from "@/lib/tasks/overview";
import type { TaskWithPeople } from "@/lib/tasks/queries";

import type { PanelNext } from "./TaskPanel";

const GLOW_MS = 1300;

/** The rows of the table as the eye sees them — sorted by a column, folded groups left out. */
export function rowsOnScreen(box: HTMLElement | null): string[] {
  if (!box) return [];
  return [...box.querySelectorAll<HTMLElement>('[data-testid="desk-row"]')].map((row) => row.dataset.rowKey ?? "").filter(Boolean);
}

/**
 * The rows in hand of the table of «Задачи» (D-154 wave 3): the chosen one (or the one open in the
 * panel) — a row that leaves gives its place to the one now standing there, and after the
 * director's own move the panel goes on to it (`mark`, `panelNext`); the marked ones (Ctrl/Shift-
 * click, X, Shift+↑/↓, Ctrl+A) with what the bulk bar may do to them, kept while they stay in the
 * table, Esc takes them off; and the row that changed under the eyes (Realtime, or the director's
 * own move), which glows once.
 */
export function useTaskSelection({
  ids,
  tab,
  openId,
  openTask,
  gridBox,
  byId,
  all,
  rows,
  now,
}: {
  /** the table's rows in their groups' order */
  ids: readonly string[];
  tab: DirectorTab;
  openId: string | null;
  openTask: (id: string) => void;
  gridBox: RefObject<HTMLDivElement | null>;
  /** every row a table may show */
  byId: ReadonlyMap<string, TaskWithPeople>;
  all: readonly TaskWithPeople[];
  /** the director's own rows of the board */
  rows: ReadonlyMap<string, BoardTask>;
  now: Date;
}) {
  /* ---- the row in hand: selected, or open in the panel; a row that leaves gives its place ---- */
  const [selected, setSelected] = useState<string | null>(null);
  const focusKey = openId ?? selected;
  const [anchor, setAnchor] = useState<{ id: string; index: number; tab: DirectorTab } | null>(null);
  const at = focusKey ? ids.indexOf(focusKey) : -1;
  if (focusKey && at >= 0 && (anchor?.id !== focusKey || anchor.index !== at || anchor.tab !== tab)) setAnchor({ id: focusKey, index: at, tab });
  const gone = Boolean(focusKey) && at < 0 && anchor !== null && anchor.id === focusKey && anchor.tab === tab;
  const inPlace = gone && anchor ? inPlaceOf(ids, anchor.index) : null;
  if (!openId && selected && gone && inPlace !== selected) setSelected(inPlace);

  // the director's own move on the open task: when it leaves the tab, the panel goes on to the next one
  const [acted, setActed] = useState<string | null>(null);
  const advance = Boolean(openId && gone && inPlace && acted === openId);
  useEffect(() => {
    if (advance && inPlace) openTask(inPlace);
  }, [advance, inPlace, openTask]);
  const panelNext: PanelNext | null =
    openId && gone && !advance ? { id: acted === openId ? null : inPlace, onGo: () => inPlace && openTask(inPlace) } : null;

  /* ---- the marked rows: kept while they stay in the table ---- */
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set());
  const [pickFrom, setPickFrom] = useState<string | null>(null);
  const marked = useMemo(() => pickedInOrder(ids, picked), [ids, picked]);
  const markedTasks = useMemo(() => marked.map((id) => byId.get(id)).filter((task): task is TaskWithPeople => Boolean(task)), [marked, byId]);
  const plan = useMemo(
    () => bulkPlan(markedTasks.map((task) => ({ ...task, nudged_at: rows.get(task.id)?.nudged_at ?? null, time_request: rows.get(task.id)?.time_request ?? null })), now),
    [markedTasks, rows, now],
  );
  const unpick = () => {
    setPicked(new Set());
    setPickFrom(null);
  };
  const pickOne = (id: string) => {
    setPicked((was) => togglePick(was, id));
    setPickFrom(id);
  };
  const pickTo = (id: string) => {
    const range = pickRange(rowsOnScreen(gridBox.current), pickFrom ?? focusKey, id);
    setPicked((was) => new Set([...was, ...range]));
    setPickFrom(id);
  };
  /** Ctrl/Cmd+A — every row in sight. */
  const pickAll = () => setPicked(new Set(rowsOnScreen(gridBox.current)));
  /** Shift+↑/↓ — marks as it goes, from the row in hand. */
  const pickStep = (from: string | null, next: string) => {
    setPicked((was) => new Set([...was, ...(from ? [from] : []), next]));
    setPickFrom(next);
  };

  // Esc takes the marks off wherever the caret is (the bar's buttons, the page) — before the panel closes
  useScreenKeys((event) => {
    if (event.key !== "Escape") return false;
    setPicked(new Set());
    setPickFrom(null);
    return true;
  }, picked.size > 0);

  /* ---- a row changed under the eyes: it glows once ---- */
  const signatures = useMemo(() => new Map(all.map((task) => [task.id, rowSignature(task, rows.get(task.id))])), [all, rows]);
  const [seen, setSeen] = useState(signatures);
  const [glow, setGlow] = useState<string | null>(null);
  if (seen !== signatures) {
    const changed = firstChanged(seen, signatures, (id) => all.find((task) => task.id === id)?.status);
    setSeen(signatures);
    if (changed) setGlow(changed);
  }
  useEffect(() => {
    if (!glow) return;
    const timer = setTimeout(() => setGlow(null), GLOW_MS);
    return () => clearTimeout(timer);
  }, [glow]);

  return { selected, setSelected, focusKey, mark: setActed, panelNext, picked, marked, plan, unpick, pickOne, pickTo, pickAll, pickStep, glow };
}
