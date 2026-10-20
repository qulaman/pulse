"use client";

import { NoteIcon, type NoteIconName } from "@/components/notes/icons";
import { SHEET_CLOSE_MS, Sheet } from "@/components/ui/Sheet";

/** One action of the board's «⋯»; absent from the list when it has nothing to do here. */
export type BoardMenuItem = {
  key: string;
  label: string;
  /** What it will touch: «3 открытых пункта», «2 отмечено». */
  detail?: string;
  icon: NoteIconName;
  danger?: boolean;
  /** Opens another sheet: this one slides away first. */
  sheet?: boolean;
  run: () => void;
};

/**
 * «⋯» of a board (D-140): everything a board can do besides being said and shown, in one
 * place instead of a title to tap, a button at the bottom of the screen and nothing else —
 * the pattern of a task's «Все действия» (D-87): a list of rows, each an icon and a word.
 */
export function BoardMenu({ open, onClose, title, items }: { open: boolean; onClose: () => void; title: string; items: BoardMenuItem[] }) {
  return (
    <Sheet open={open} onClose={onClose} title="Доска">
      <p className="-mt-1 line-clamp-2 text-[14px] leading-[19px] text-muted [overflow-wrap:anywhere]">{title}</p>
      <div className="mt-3 flex flex-col gap-1" data-testid="board-menu">
        {items.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`board-menu-${item.key}`}
            onClick={() => {
              onClose();
              // the next sheet slides in after this one has gone
              setTimeout(item.run, item.sheet ? SHEET_CLOSE_MS : 0);
            }}
            className={`flex min-h-[52px] items-center gap-3 rounded-[14px] px-3 text-left text-[16px] font-medium transition-colors duration-[120ms] active:bg-surface-2 ${
              item.danger ? "text-danger" : "text-text"
            }`}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
              style={{ background: item.danger ? "color-mix(in srgb, var(--danger) 12%, transparent)" : "var(--surface-2)" }}
            >
              <NoteIcon name={item.icon} size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block">{item.label}</span>
              {item.detail ? <span className="block truncate text-[13px] leading-[17px] text-muted">{item.detail}</span> : null}
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
