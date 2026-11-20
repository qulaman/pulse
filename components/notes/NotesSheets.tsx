"use client";

import { BoardPicker } from "@/components/mindboard/BoardPicker";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import type { BoardSummary } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";
import { firstLine } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";
import type { Me } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

import { AssignSheet } from "./AssignSheet";
import { RemindSheet } from "./RemindSheet";

/**
 * What waits to be removed for good: notes of the bin, and boards with their points (D-102);
 * `branch` — one point of a board with the sub-points that rode with it (D-121).
 */
export type Purge = { notes: string[]; boards: string[]; branch?: boolean };

/** Where a thought goes on a board: one of the live ones, or a new one made for it. */
export type BoardTarget = { id: string; title: string; fresh: boolean };

/** What «Удалить навсегда» and «Очистить» say: notes, boards with their points, or both. */
function purgeText(purging: Purge | null): string {
  if (!purging) return "";
  const notes = purging.notes.length;
  const boards = purging.boards.length;
  if (purging.branch) return "Пункт исчезнет вместе с подпунктами. Вернуть будет нельзя.";
  if (boards === 0) {
    return notes > 1
      ? `${notes} ${pluralRu(notes, ["заметка исчезнет", "заметки исчезнут", "заметок исчезнут"])} вместе с текстом. Вернуть будет нельзя.`
      : "Заметка исчезнет вместе с текстом. Вернуть будет нельзя.";
  }
  const boardWords = boards === 1 ? "Доска исчезнет вместе с пунктами" : `${boards} ${pluralRu(boards, ["доска исчезнет", "доски исчезнут", "досок исчезнут"])} вместе с пунктами`;
  const noteWords = notes > 0 ? `, и ${notes} ${pluralRu(notes, ["заметка", "заметки", "заметок"])}` : "";
  return `${boardWords}${noteWords}. Вернуть будет нельзя.`;
}

/**
 * The sheets over the phone's «Заметки»: «Поручить» (D-108), «На доску» (D-140), «Напомнить»
 * (D-95) and «Удалить навсегда». Each opens while its subject is set and closes by its own setter.
 */
export function NotesSheets({
  me,
  assigning,
  onAssignClose,
  boarding,
  onBoardClose,
  boards,
  summaries,
  onBoard,
  onNewBoard,
  reminding,
  onRemindClose,
  onRemind,
  purging,
  onPurgeClose,
  onPurge,
}: {
  me: Me;
  assigning: Note | null;
  onAssignClose: () => void;
  boarding: Note | null;
  onBoardClose: () => void;
  boards: readonly MindBoard[];
  summaries: Map<string, BoardSummary>;
  onBoard: (target: BoardTarget) => void;
  /** «Новая доска» of the picker: made first, then the thought goes there. */
  onNewBoard: () => void;
  reminding: Note | null;
  onRemindClose: () => void;
  onRemind: (note: Note, iso: string | null) => void;
  purging: Purge | null;
  onPurgeClose: () => void;
  onPurge: (purge: Purge) => void;
}) {
  return (
    <>
      <AssignSheet note={assigning} onClose={onAssignClose} me={me} />

      <BoardPicker
        open={boarding !== null}
        onClose={onBoardClose}
        subject={boarding ? firstLine(boarding.text) : null}
        boards={boards}
        summaries={summaries}
        onPick={(board) => onBoard({ id: board.id, title: board.title, fresh: false })}
        onNew={() => {
          // a move needs the network; a board made «for later» would wait with nothing on it
          if (!navigator.onLine) {
            onBoardClose();
            toast("Нет связи — мысль осталась в «Мыслях»");
            return;
          }
          onNewBoard();
        }}
      />

      <RemindSheet
        open={reminding !== null}
        onClose={onRemindClose}
        currentIso={reminding?.remind_at ?? null}
        onPick={(iso) => {
          if (reminding) onRemind(reminding, iso);
        }}
      />

      <Sheet open={purging !== null} onClose={onPurgeClose} title={purging && !purging.branch && purging.notes.length + purging.boards.length > 1 ? "Очистить корзину" : "Удалить навсегда"}>
        <p className="text-[16px] leading-[22px] text-muted">{purgeText(purging)}</p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            data-testid="notes-purge-confirm"
            onClick={() => {
              if (purging) onPurge(purging);
              onPurgeClose();
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={onPurgeClose}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </>
  );
}
