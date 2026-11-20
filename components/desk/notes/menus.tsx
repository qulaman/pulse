import type { MenuItem } from "@/components/desk/ui/Menu";
import { NoteIcon } from "@/components/notes/icons";
import type { Note } from "@/lib/notes/queries";

import type { Intent } from "./keys";
import { isThought, type NoteActions } from "./useNoteActions";

/** The menu of a row (a right click): the chosen note's actions with their keys. */
export function rowMenu(note: Note, actions: NoteActions, setIntent: (intent: Intent) => void): MenuItem[] {
  if (note.deleted_at !== null) {
    return [
      { key: "restore", label: "Вернуть в мысли", icon: <NoteIcon name="restore" size={14} />, onSelect: () => actions.restore(note) },
      "separator",
      { key: "purge", label: "Удалить навсегда…", hint: "Del", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.purge([note]) },
    ];
  }
  const thought = isThought(note);
  const empty = !note.text.trim();
  return [
    ...(thought
      ? ([
          { key: "assign", label: "Поручить…", hint: "T", icon: <NoteIcon name="task" size={14} />, disabled: empty, onSelect: () => setIntent({ id: note.id, kind: "assign" }) },
          { key: "remind", label: "Напомнить…", hint: "R", icon: <NoteIcon name="bell" size={14} />, onSelect: () => setIntent({ id: note.id, kind: "remind" }) },
          { key: "board", label: "На доску…", hint: "B", icon: <NoteIcon name="board" size={14} />, disabled: empty, onSelect: () => setIntent({ id: note.id, kind: "board" }) },
          { key: "pin", label: note.pinned ? "Открепить" : "Закрепить", hint: "P", icon: <NoteIcon name="pin" size={14} />, onSelect: () => actions.pin(note) },
          { key: "announce", label: "Объявить…", hint: "A", icon: <NoteIcon name="megaphone" size={14} />, disabled: empty, onSelect: () => actions.announce(note) },
        ] satisfies MenuItem[])
      : []),
    { key: "copy", label: "Скопировать текст", icon: <NoteIcon name="copy" size={14} />, disabled: empty, onSelect: () => actions.copy(note) },
    "separator",
    { key: "bin", label: "В корзину", hint: "Del", danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.bin(note) },
  ];
}

/** The menu over several chosen notes. */
export function bulkMenu(list: Note[], actions: NoteActions, setIntent: (intent: Intent) => void): MenuItem[] {
  const thoughts = list.filter(isThought);
  return [
    { key: "board", label: "На доску…", icon: <NoteIcon name="board" size={14} />, disabled: thoughts.length === 0, onSelect: () => setIntent({ id: "picked", kind: "board" }) },
    { key: "remind", label: "Напомнить…", icon: <NoteIcon name="bell" size={14} />, disabled: thoughts.length === 0, onSelect: () => setIntent({ id: "picked", kind: "remind" }) },
    "separator",
    { key: "bin", label: `В корзину · ${list.length}`, danger: true, icon: <NoteIcon name="trash" size={14} />, onSelect: () => actions.binMany(list.filter((note) => note.deleted_at === null)) },
  ];
}
