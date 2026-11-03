"use client";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * What waits to be removed for good: notes of the bin, and boards with their points (D-102);
 * `branch` — one point of a board with the sub-points that rode with it (D-121).
 */
export type Purge = { notes: string[]; boards: string[]; branch?: boolean };

/** What «Удалить навсегда» and «Очистить» say — the phone screen's words. */
function purgeText(purging: Purge): string {
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

/** The only hard delete of a note or a board, and only from the bin — asked once more. */
export function PurgeDialog({ purging, onClose, onConfirm }: { purging: Purge | null; onClose: () => void; onConfirm: (purging: Purge) => void }) {
  const many = purging !== null && !purging.branch && purging.notes.length + purging.boards.length > 1;
  return (
    <Dialog open={purging !== null} onClose={onClose} title={many ? "Очистить корзину" : "Удалить навсегда"} width="sm">
      {purging ? <p className="text-[14px] leading-5 text-muted">{purgeText(purging)}</p> : null}
      <div className="mt-4 flex justify-end gap-2">
        <Button size="sm" variant="secondary" onClick={onClose}>
          Не сейчас
        </Button>
        <Button size="sm" variant="danger" data-testid="desk-purge-confirm" onClick={() => purging && onConfirm(purging)}>
          Удалить
        </Button>
      </div>
    </Dialog>
  );
}
