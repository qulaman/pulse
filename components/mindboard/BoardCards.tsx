"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { boardExpiresAt, summaryLine, type BoardSummary } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";
import { whenRu } from "@/lib/notes/list";

function BoardGlyph({ lit }: { lit: boolean }) {
  const color = lit ? "var(--accent)" : "var(--text-muted)";
  return (
    <span
      aria-hidden
      className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      <NoteIcon name="board" size={13} />
    </span>
  );
}

/**
 * A board in the «Доски» tab (D-102 §3, D-140): the title, its first points, how many points
 * and how many ticked, «закреплена», the lamp «на стене» while it is up in the office. A tap
 * opens the board.
 */
export function BoardCard({
  board,
  summary,
  preview = [],
  onWall,
  now,
}: {
  board: MindBoard;
  summary: BoardSummary | undefined;
  /** The first lines of its first points. */
  preview?: string[];
  onWall: boolean;
  now: Date;
}) {
  // a base older than the client has no such field: not finished (D-140)
  const finished = Boolean(board.finished_at);
  return (
    <Link
      href={`/notes/b/${board.id}`}
      className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5 transition-transform duration-[120ms] active:scale-[0.99]"
      data-testid="board-card"
      data-board-id={board.id}
      data-closed={finished || undefined}
    >
      <BoardGlyph lit={onWall} />
      <span className="min-w-0 flex-1">
        <span className={`line-clamp-2 font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] ${finished ? "text-text/70" : ""}`}>{board.title}</span>
        {preview.length > 0 ? (
          <span className="mt-1 flex flex-col text-[13px] leading-[18px] text-muted" data-testid="board-card-preview">
            {preview.map((line, index) => (
              <span key={index} className="truncate">
                {index + 1}. {line}
              </span>
            ))}
          </span>
        ) : null}
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          {board.pinned_at && !finished ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-accent" data-testid="board-card-pinned">
              <NoteIcon name="pin" size={11} />
            </span>
          ) : null}
          <span className="min-w-0 truncate" data-testid="board-card-summary">{summaryLine(summary)}</span>
          {onWall ? (
            <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-accent" data-testid="board-card-wall">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} />
              на стене
            </span>
          ) : null}
          <span className="nums ml-auto shrink-0">{whenRu(board.updated_at, now)}</span>
        </span>
      </span>
      <span aria-hidden className="mt-1 shrink-0 text-muted/70">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 5.5 15.5 12 9 18.5" />
        </svg>
      </span>
    </Link>
  );
}

/**
 * «Завершённые» (D-140): boards whose meeting is over, at the bottom of the tab, folded — the
 * way back to «что решили в прошлый вторник» without them crowding the live ones.
 */
export function FinishedBoards({ count, children, open: initial = false }: { count: number; children: ReactNode; open?: boolean }) {
  const [open, setOpen] = useState(initial);
  return (
    <div className="mt-3" data-testid="boards-finished">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
        data-testid="boards-finished-toggle"
        className="flex min-h-[40px] w-full items-center gap-2 px-1 text-left font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted"
      >
        <NoteIcon name="flag" size={13} />
        Завершённые
        <span className="nums">{count}</span>
        <svg
          aria-hidden
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`ml-auto transition-transform duration-[160ms] ${open ? "rotate-180" : ""}`}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>
      {open ? <div className="mt-1 flex flex-col gap-2">{children}</div> : null}
    </div>
  );
}

/** «Новая доска» — the first card of the tab: a title by date, the microphone ready. */
export function NewBoardCard({ onCreate, busy }: { onCreate: () => void; busy: boolean }) {
  return (
    <button
      type="button"
      onClick={onCreate}
      disabled={busy}
      data-testid="board-new"
      className="flex w-full items-center gap-3 rounded-[18px] border border-dashed border-accent/45 px-3.5 py-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99] disabled:opacity-60"
    >
      <span aria-hidden className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <NoteIcon name="plus" size={14} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] font-semibold leading-[21px] text-accent">Новая доска</span>
        <span className="mt-0.5 block text-[13px] leading-[18px] text-muted">Продиктуйте пункты — и выведите на стену</span>
      </span>
    </button>
  );
}

/** A deleted board in the bin, with its points: the way back, and the way out for good. */
export function BoardTrashCard({
  board,
  summary,
  now,
  onRestore,
  onPurge,
}: {
  board: MindBoard;
  summary: BoardSummary | undefined;
  now: Date;
  onRestore: () => void;
  onPurge: () => void;
}) {
  return (
    <div className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5" data-closed data-testid="board-trashed">
      <span aria-hidden className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-surface-2 text-muted">
        <NoteIcon name="board" size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] text-text/70">Доска «{board.title}»</span>
        <span className="mt-1 block text-[12px] leading-4 text-muted">
          {summaryLine(summary)} · удалена {whenRu(board.deleted_at ?? board.updated_at, now)}
        </span>
        <span className="nums mt-0.5 block text-[12px] leading-4" style={{ color: "var(--warn)" }}>
          исчезнет {humanAqtobe(boardExpiresAt(board), now)}
        </span>
        <span className="mt-3 flex items-center gap-2">
          <Button variant="secondary" size="sm" icon={<NoteIcon name="restore" size={14} />} data-testid="board-restore" onClick={onRestore}>
            Вернуть
          </Button>
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={onPurge}>
            Удалить навсегда
          </Button>
        </span>
      </span>
    </div>
  );
}
