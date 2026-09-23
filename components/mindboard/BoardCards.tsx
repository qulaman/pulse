"use client";

import Link from "next/link";

import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { humanAqtobe } from "@/lib/ai/time";
import { boardExpiresAt, type BoardSummary } from "@/lib/mindboard/list";
import type { MindBoard } from "@/lib/mindboard/queries";
import { whenRu } from "@/lib/notes/list";
import { pluralRu } from "@/lib/tasks/status-text";

/** «5 пунктов · 2 отмечено» — or «Пока пусто» for a board with nothing on it yet. */
export function pointsLine(summary: BoardSummary | undefined): string {
  const total = summary?.total ?? 0;
  if (total === 0) return "Пока пусто";
  const done = summary?.done ?? 0;
  const head = `${total} ${pluralRu(total, ["пункт", "пункта", "пунктов"])}`;
  return done > 0 ? `${head} · ${done} ${pluralRu(done, ["отмечен", "отмечено", "отмечено"])}` : head;
}

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
 * A board in the «Доски» tab (D-102 §3): the title, how many points and how many ticked,
 * the lamp «на стене» while it is up in the office. A tap opens the board.
 */
export function BoardCard({ board, summary, onWall, now }: { board: MindBoard; summary: BoardSummary | undefined; onWall: boolean; now: Date }) {
  return (
    <Link
      href={`/notes/b/${board.id}`}
      className="task-card flex items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5 transition-transform duration-[120ms] active:scale-[0.99]"
      data-testid="board-card"
      data-board-id={board.id}
    >
      <BoardGlyph lit={onWall} />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em]">{board.title}</span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          <span className="min-w-0 truncate">{pointsLine(summary)}</span>
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
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] text-text/70">Доска «{board.title}»</span>
        <span className="mt-1 block text-[12px] leading-4 text-muted">
          {pointsLine(summary)} · удалена {whenRu(board.deleted_at ?? board.updated_at, now)}
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
