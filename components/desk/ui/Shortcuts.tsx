"use client";

import { useEffect, useId } from "react";
import { create } from "zustand";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";

export type Shortcut = { keys: string[]; label: string };
type Group = { id: string; title: string; items: Shortcut[] };

type ShortcutsState = { groups: Group[]; open: boolean; set: (group: Group) => void; drop: (id: string) => void; show: (open: boolean) => void };

/** What the keys of the desk do, as the mounted parts say it (D-154 wave 3) — read by the «?» help. */
const useShortcutsStore = create<ShortcutsState>((set) => ({
  groups: [],
  open: false,
  set: (group) => set((state) => ({ groups: [...state.groups.filter((g) => g.id !== group.id), group] })),
  drop: (id) => set((state) => ({ groups: state.groups.filter((g) => g.id !== id) })),
  show: (open) => set({ open }),
}));

/**
 * A screen (or a part) tells the «?» help which keys it answers to while it is mounted. Only the
 * words: the screen handles the keys itself. Keys are written as they read on the keyboard
 * («A», «Ctrl K», «↑ ↓», «Esc»); the layout does not matter — the desk matches `event.code`.
 */
export function useShortcuts(title: string, items: Shortcut[]) {
  const id = useId();
  const key = JSON.stringify(items);
  useEffect(() => {
    useShortcutsStore.getState().set({ id, title, items: JSON.parse(key) as Shortcut[] });
    return () => useShortcutsStore.getState().drop(id);
  }, [id, title, key]);
}

/** Opens the help from a button or a menu. */
export function openShortcuts() {
  useShortcutsStore.getState().show(true);
}

/** The keys that work on every desk screen, for both roles; the order line says its own (the director's). */
const EVERYWHERE: Shortcut[] = [
  { keys: ["?"], label: "Эта справка" },
  { keys: ["Esc"], label: "Закрыть список или диалог, отпустить поле, закрыть панель" },
];

/**
 * «?» outside a field shows every key of this screen and of the desk (D-154 wave 3): the mouse
 * finds a control, the help teaches its key once.
 */
export function ShortcutsHelp() {
  const open = useShortcutsStore((state) => state.open);
  const groups = useShortcutsStore((state) => state.groups);
  const show = useShortcutsStore((state) => state.show);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key !== "?") return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (target?.isContentEditable || tag === "input" || tag === "textarea" || tag === "select") return;
      event.preventDefault();
      show(!useShortcutsStore.getState().open);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [show]);

  const all: Group[] = [...groups.filter((g) => g.items.length > 0), { id: "desk", title: "Везде", items: EVERYWHERE }];
  return (
    <Dialog open={open} onClose={() => show(false)} title="Клавиши" width="lg">
      {/* two columns that fill like a newspaper: a long group never leaves a hole beside a short one */}
      <div className="columns-2 gap-x-8" data-testid="desk-shortcuts">
        {all.map((group) => (
          <section key={group.id} className="mb-5 break-inside-avoid">
            <h3 className="mb-2 text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{group.title}</h3>
            <ul className="flex flex-col gap-1.5">
              {group.items.map((item) => (
                <li key={`${item.keys.join("+")}-${item.label}`} className="flex items-center justify-between gap-4 text-[13px] leading-5">
                  <span className="min-w-0 text-text/90">{item.label}</span>
                  <span className="flex shrink-0 items-center gap-1">
                    {item.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
