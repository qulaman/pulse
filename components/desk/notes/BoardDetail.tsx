"use client";

import BoardPage from "@/app/(director)/notes/b/[id]/page";

/**
 * A board on the right of «Заметки» (D-153): the phone's board screen as it is — its data glue,
 * `BoardScreen`, the dictaphone, the sketch pad (pointer events, a mouse draws too), «на стену»
 * and every sheet of it — in a column up to 900 px. What only the phone needs is put aside here
 * without a fork: the column's width instead of `max-w-lg`, no room kept under a tab bar, and no
 * «‹ Заметки» — the list of boards stands on the left.
 */
export function BoardDetail() {
  return (
    <div
      className="mx-auto w-full max-w-[900px] px-2 pb-8 pt-1 [&_.max-w-lg]:max-w-none [&>main]:pb-6 [&_[data-testid=board-back]]:invisible"
      data-testid="desk-board"
    >
      <BoardPage />
    </div>
  );
}
