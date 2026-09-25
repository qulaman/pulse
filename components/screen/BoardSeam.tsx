"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";

import { Key, Led, Seam, Switch } from "@/components/ui/device/Device";
import s from "@/components/ui/device/device.module.css";
import { Sheet } from "@/components/ui/Sheet";
import type { MindBoard } from "@/lib/mindboard/queries";
import { boardCountLine } from "@/lib/tv/board";
import { tvTime } from "@/lib/tv/clock";
import type { TvControlInput } from "@/lib/tv/mutations";
import { boardShelf, cartridgeLine, countLine, type BoardCount } from "@/lib/tv/presenter";
import type { TvState } from "@/lib/tv/queries";
import { boardUntilFrom } from "@/lib/tv/state";

import c from "./board-seam.module.css";
import type { WallBoard } from "./useWallBoard";

type Props = {
  wall: WallBoard;
  row: TvState | null;
  now: Date;
  /** «Гость в кабинете» is on: the board hides from the wall unless shown to the guest (D-102 §7). */
  guest: boolean;
  /** The remote's command: the page's `tv_control`, so the lens blinks for it like for every key. */
  show: (input: TvControlInput, message: string) => void;
};

/**
 * «Доска на стене» (D-102 §9, D-121). The board on the wall sits in a slot like a cartridge:
 * its name, how many points and until when, «Открыть доску» and «Убрать со стены»; with a
 * guest in the office — «Показать гостю» right under it. Below, the shelf: the three latest
 * other boards as keys (one tap puts a board on the wall till 21:00) and «Все доски» — a
 * sheet with every live board — when there are more. No boards — the way to make one.
 */
export function BoardSeam({ wall, row, now, guest, show }: Props) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const shelf = boardShelf(wall.boards, now, wall.boardId);
  const until = row?.board_until ? new Date(row.board_until) : null;

  const put = (board: MindBoard) => show({ board: board.id }, `На стене — «${board.title}»`);

  return (
    <>
      <Seam label="Доска на стене" />

      {wall.boardId ? (
        <div className="mt-2" data-testid="remote-cartridge">
          <Cartridge wall={wall} until={until} />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Key
              icon={<OpenIcon />}
              disabled={!wall.board || wall.board.deleted_at !== null}
              data-testid="remote-board-open"
              onClick={() => router.push(`/notes/b/${wall.boardId}`)}
            >
              Открыть доску
            </Key>
            <Key icon={<EjectIcon />} data-testid="remote-board-eject" onClick={() => show({ scene: "face" }, "Доска убрана со стены")}>
              Убрать со стены
            </Key>
          </div>
          {guest ? (
            <div className="mt-2">
              <Switch
                on={row?.board_guest ?? false}
                icon={<BoardIcon />}
                title="Показать гостю"
                value={row?.board_guest ? "доска видна гостю" : "доска скрыта, пока гость здесь"}
                onToggle={(next) => show({ boardGuest: next }, next ? "Доска видна гостю" : "Доска скрыта от гостя")}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {shelf.live.length === 0 && !wall.loading ? (
        <div className="mt-2" data-testid="remote-boards-empty">
          <p className="px-1 text-center text-[13px] leading-[18px] text-muted">
            Досок пока нет. Надиктуйте пункты — и доска встанет на стену одним тапом
          </p>
          <div className="mt-2">
            <Key icon={<PlusIcon />} onClick={() => router.push("/notes?tab=boards")}>
              Создать в «Заметках»
            </Key>
          </div>
        </div>
      ) : shelf.keys.length > 0 || shelf.rest > 0 ? (
        <>
          {wall.boardId ? <p className={`${s.print} mt-3 px-1`}>Другие доски</p> : null}
          <div className="mt-2 grid grid-cols-2 gap-2" data-testid="remote-boards">
            {shelf.keys.map((board) => (
              <Key key={board.id} tall aria-label={`На стену: «${board.title}»`} data-testid="remote-board" onClick={() => put(board)}>
                <span className={c.keyTitle}>{board.title}</span>
                <span className={c.keyCount}>{countLine(wall.counts.get(board.id))}</span>
              </Key>
            ))}
            {shelf.rest > 0 ? (
              <Key tall icon={<ShelfIcon />} data-testid="remote-boards-all" onClick={() => setPicking(true)}>
                <span>Все доски</span>
                <span className={c.keyCount}>ещё {shelf.rest}</span>
              </Key>
            ) : null}
          </div>
          {wall.boardId ? null : (
            <p className="mt-1.5 px-1 text-center text-[13px] leading-[18px] text-muted">
              Тап — доска на стене до {tvTime(boardUntilFrom(now))}
            </p>
          )}
        </>
      ) : null}

      <Sheet open={picking} onClose={() => setPicking(false)} title="Доски">
        <div className="flex flex-col gap-2" data-testid="remote-boards-sheet">
          {shelf.live.map((board) => (
            <BoardRow
              key={board.id}
              board={board}
              count={wall.counts.get(board.id)}
              onWall={board.id === wall.boardId}
              onPick={() => {
                setPicking(false);
                if (board.id !== wall.boardId) put(board);
              }}
            />
          ))}
        </div>
        <button
          type="button"
          className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 text-[14px] font-semibold text-accent"
          onClick={() => router.push("/notes?tab=boards")}
        >
          <PlusIcon />
          Новая доска — в «Заметках»
        </button>
      </Sheet>
    </>
  );
}

/** The board on the wall, in its slot: lamp, name, «7 пунктов · до 21:00». */
function Cartridge({ wall, until }: { wall: WallBoard; until: Date | null }) {
  const board = wall.board;
  const binned = board?.deleted_at != null;
  const title = board ? board.title : wall.loading ? "" : "Доска другого директора";
  const line = binned ? "в корзине — на стене её уже нет" : until ? cartridgeLine(wall.counts.get(wall.boardId ?? ""), until) : "";

  return (
    <div className={c.slot}>
      <div className={c.cart}>
        <Led tone={binned ? "off" : "accent"} />
        <span className="min-w-0 flex-1">
          <span
            className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] [overflow-wrap:anywhere]"
            data-testid="remote-cartridge-title"
          >
            {title}
          </span>
          <span className="nums mt-0.5 block truncate text-[13px] leading-[18px] text-muted" data-testid="remote-cartridge-line">
            {line}
          </span>
        </span>
        <span aria-hidden className={c.ridges}>
          <span />
          <span />
          <span />
        </span>
      </div>
    </div>
  );
}

/** A board in «Все доски»: a list row, not a key — the kit is not for lists (D-80 §2). */
function BoardRow({ board, count, onWall, onPick }: { board: MindBoard; count: BoardCount | undefined; onWall: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-current={onWall || undefined}
      data-testid="remote-sheet-board"
      className="task-card flex w-full items-start gap-3 rounded-[18px] px-3.5 pb-3 pt-3.5 text-left transition-transform duration-[120ms] active:scale-[0.99]"
    >
      <span
        aria-hidden
        className="mt-[1px] flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${onWall ? "var(--accent)" : "var(--text-muted)"} 14%, transparent)`,
          color: onWall ? "var(--accent)" : "var(--text-muted)",
        }}
      >
        <BoardIcon size={13} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2 block font-display text-[16px] font-semibold leading-[21px] tracking-[-0.01em] [overflow-wrap:anywhere]">
          {board.title}
        </span>
        <span className="mt-1.5 flex items-center gap-1.5 text-[12px] leading-4 text-muted">
          <span className="min-w-0 truncate">{boardCountLine(count ?? { total: 0, done: 0 })}</span>
          {onWall ? (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1 font-semibold text-accent">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" style={{ boxShadow: "0 0 8px var(--accent)" }} />
              на стене
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Glyphs — the stroke family of the remote (app/(director)/screen/page.tsx)  */
/* -------------------------------------------------------------------------- */

function Svg({ children, size = 20 }: { children: ReactNode; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

function BoardIcon({ size = 20 }: { size?: number }) {
  return (
    <Svg size={size}>
      <rect x="2.8" y="3.4" width="14.4" height="13.2" rx="2.2" />
      <path d="M6 7.6h.01M8.8 7.6h5.2M6 10.6h.01M8.8 10.6h5.2M6 13.6h.01M8.8 13.6h3.4" strokeWidth="1.8" />
    </Svg>
  );
}

/** Open the board on the phone: a sheet with an arrow out of it. */
const OpenIcon = () => (
  <Svg>
    <path d="M9 4H5.2A2.2 2.2 0 0 0 3 6.2v8.6A2.2 2.2 0 0 0 5.2 17h8.6a2.2 2.2 0 0 0 2.2-2.2V11" />
    <path d="M11.4 3h5.6v5.6M17 3l-7.2 7.2" />
  </Svg>
);

/** ⏏ — the cartridge out of its slot. */
const EjectIcon = () => (
  <Svg>
    <path d="M10 4.2l5.6 6.4H4.4z" />
    <path d="M4.4 14.8h11.2" strokeWidth="2" />
  </Svg>
);

/** Boards stacked on a shelf. */
const ShelfIcon = () => (
  <Svg>
    <rect x="3" y="7" width="14" height="10" rx="2" />
    <path d="M5 4.4h10M6.6 2h6.8" />
  </Svg>
);

const PlusIcon = () => (
  <Svg>
    <path d="M10 4v12M4 10h12" />
  </Svg>
);
