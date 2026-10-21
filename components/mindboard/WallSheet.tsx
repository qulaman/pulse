"use client";

import { NoteIcon } from "@/components/notes/icons";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { wallNote } from "@/lib/mindboard/wall";
import type { TvBoardData } from "@/lib/tv/board";
import { tvTime } from "@/lib/tv/clock";
import { BOARD_VIEWS, boardUntilFrom, type BoardView } from "@/lib/tv/state";

import { WallPreview } from "./WallPreview";

/** «На 30 минут», «На час» — besides «до конца дня», the default of a tap (D-140). */
export const WALL_SPANS = [30, 60] as const;
/** «+30 мин» to a board already up. */
export const EXTEND_MINUTES = 30;

const VIEW_LABEL: Record<BoardView, string> = { list: "Список", map: "Карта" };

type Props = {
  open: boolean;
  onClose: () => void;
  /** The board as the wall will draw it (the phone's cache, `wallBoardOf`). */
  data: TvBoardData;
  now: Date;
  /** This board is up on the wall now, and till when. */
  onWall: boolean;
  until: Date | null;
  /** The wall is busy with a command. */
  busy: boolean;
  /**
   * «Доска недели» (D-144): `can` — the board may go in the round (not finished); `on` — it is
   * there now; `taken` — another board is; `busy` — the command is on its way.
   */
  week: { can: boolean; on: boolean; taken: boolean; busy: boolean };
  onWeek: (on: boolean) => void;
  onView: (view: BoardView) => void;
  /** Up on the wall: for so many minutes, or (null) till the end of the day. */
  onShow: (minutes: number | null) => void;
  onExtend: () => void;
  onEject: () => void;
};

/**
 * «Как на стене» (D-140): the board as the office will see it, before it goes up and while it
 * is there — the same picture the kiosk draws, «Список / Карта» under it (a setting of the
 * wall, D-121 §7), and the time on the wall: a tap on «на стену» in the head is «до 21:00»;
 * here — half an hour or an hour for a short meeting, «+30 мин» and «Убрать» while it is up.
 * «Доска недели» (D-144) puts it in the round of screensavers till Sunday 21:00 — the map of
 * the week lives on the wall between meetings, its handed lines with their stages.
 * Opened by the preview card of the board screen and by a long press on «на стену».
 */
export function WallSheet({ open, onClose, data, now, onWall, until, busy, week, onWeek, onView, onShow, onExtend, onEject }: Props) {
  const note = wallNote(data);
  const dayEnd = tvTime(boardUntilFrom(now));

  return (
    <Sheet open={open} onClose={onClose} title="Как на стене">
      <div data-testid="wall-sheet">
        <WallPreview data={data} now={now} />
        <p className={`mt-2 min-h-[18px] px-0.5 text-[13px] leading-[18px] ${note ? "text-warn" : "text-muted"}`} data-testid="wall-sheet-note">
          {note ?? (onWall && until ? `На стене до ${tvTime(until)} · видят все в кабинете` : "Так её увидят в кабинете")}
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1 rounded-[14px] bg-surface-2/70 p-1" role="radiogroup" aria-label="Вид доски на стене">
          {BOARD_VIEWS.map((value) => {
            const on = data.view === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={on}
                data-testid={`wall-view-${value}`}
                onClick={() => {
                  if (!on) onView(value);
                }}
                className={`min-h-[40px] rounded-[11px] text-[15px] font-semibold transition-[background-color,color] duration-[160ms] ${
                  on ? "bg-surface text-text shadow-[0_1px_3px_rgba(0,0,0,0.35)]" : "text-muted"
                }`}
              >
                {VIEW_LABEL[value]}
              </button>
            );
          })}
        </div>

        {onWall ? (
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} data-testid="wall-extend" onClick={onExtend}>
              +{EXTEND_MINUTES} мин
            </Button>
            <Button variant="secondary" className="!text-danger/85" disabled={busy} data-testid="wall-eject" onClick={onEject}>
              Убрать со стены
            </Button>
          </div>
        ) : (
          <>
            <Button block className="mt-4" icon={<NoteIcon name="wall" size={18} />} disabled={busy || data.items.length === 0} data-testid="wall-show" onClick={() => onShow(null)}>
              На стену до {dayEnd}
            </Button>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {WALL_SPANS.map((minutes) => (
                <Button
                  key={minutes}
                  variant="secondary"
                  disabled={busy || data.items.length === 0}
                  data-testid={`wall-show-${minutes}`}
                  onClick={() => onShow(minutes)}
                >
                  {minutes === 60 ? "На час" : `На ${minutes} минут`}
                </Button>
              ))}
            </div>
          </>
        )}

        {week.can || week.on ? (
          <button
            type="button"
            role="switch"
            aria-checked={week.on}
            disabled={week.busy}
            onClick={() => onWeek(!week.on)}
            data-testid="wall-week"
            className="mt-4 flex min-h-[56px] w-full items-center justify-between gap-3 rounded-[14px] border border-border/80 bg-white/[0.03] px-3.5 py-2.5 text-left transition-colors duration-[120ms] active:bg-white/[0.06] disabled:opacity-60"
          >
            <span className="min-w-0">
              <span className="block font-display text-[15px] font-semibold leading-5 tracking-[-0.01em]">Доска недели</span>
              <span className={`block text-[13px] leading-[18px] ${week.on ? "text-accent" : "text-muted"}`}>
                {week.on
                  ? "В круге заставок до воскресенья, 21:00"
                  : week.taken
                    ? "Встанет в круг заставок вместо нынешней"
                    : "В круге заставок до воскресенья, с живыми поручениями"}
              </span>
            </span>
            <span aria-hidden className="relative h-7 w-12 shrink-0 rounded-full transition-colors duration-[120ms]" style={{ background: week.on ? "var(--accent)" : "var(--border)" }}>
              <span
                className="absolute top-1 h-5 w-5 rounded-full bg-bg transition-transform duration-[120ms]"
                style={{ transform: week.on ? "translateX(24px)" : "translateX(4px)" }}
              />
            </span>
          </button>
        ) : null}
      </div>
    </Sheet>
  );
}
