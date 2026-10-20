"use client";

import { NoteIcon } from "@/components/notes/icons";
import { Sheet } from "@/components/ui/Sheet";
import { summaryLine, type BoardSummary } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";

/**
 * «На какую доску?» (D-140): a point leaves for another board with its branch, a thought
 * from «Мысли» becomes a point. The live boards in the order of the list, «Новая доска»
 * first — a thought often starts the next meeting's board.
 */
export function BoardPicker({
  open,
  onClose,
  subject,
  boards,
  summaries,
  onPick,
  onNew,
}: {
  open: boolean;
  onClose: () => void;
  /** The line that moves, as a reminder of what was tapped. */
  subject: string | null;
  boards: readonly MindBoard[];
  summaries: Map<string, BoardSummary>;
  onPick: (board: MindBoard) => void;
  onNew: () => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="На какую доску?">
      {subject ? <p className="-mt-1 line-clamp-2 text-[14px] leading-[19px] text-muted [overflow-wrap:anywhere]">{subject}</p> : null}
      <div className="mt-3 flex flex-col gap-2" data-testid="board-picker">
        <button
          type="button"
          onClick={onNew}
          data-testid="board-picker-new"
          className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-accent/45 px-3.5 py-3 text-left transition-transform duration-[120ms] active:scale-[0.99]"
        >
          <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
            <NoteIcon name="plus" size={14} />
          </span>
          <span className="font-display text-[16px] font-semibold leading-[21px] text-accent">Новая доска</span>
        </button>
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => onPick(board)}
            data-testid="board-picker-board"
            className="task-card flex w-full items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
          >
            <span aria-hidden className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
              <NoteIcon name="board" size={13} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] [overflow-wrap:anywhere]">{board.title}</span>
              <span className="mt-1 block truncate text-[12px] leading-4 text-muted">{summaryLine(summaries.get(board.id))}</span>
            </span>
          </button>
        ))}
        {boards.length === 0 ? <p className="px-1 text-center text-[13px] leading-[18px] text-muted">Других досок пока нет</p> : null}
      </div>
    </Sheet>
  );
}
