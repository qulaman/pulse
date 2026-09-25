"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMemo, useSyncExternalStore } from "react";

import {
  BOARD_HEIGHT,
  BOARD_TITLE_GAP,
  BOARD_TOP_GAP,
  BOARD_TOP_ROW,
  boardCountLine,
  boardFrame,
  freshKey,
  pageAt,
  wallView,
  type TvBoard as TvBoardData,
  type TvBoardData as Board,
} from "@/lib/tv/board";
import { listLayout, pageOfPoint, titleFit } from "@/lib/tv/boardList";
import { mapLayout } from "@/lib/tv/boardMap";
import { tvTime } from "@/lib/tv/clock";

import { TvBoardList } from "./TvBoardList";
import { TvBoardMap } from "./TvBoardMap";
import { EASE, vh } from "./TvBoardParts";

const MAP_MARGIN = 1.6;

/**
 * Заставка «Доска» (D-102 §8, D-121): мысли директора на стене кабинета, два вида.
 *  - «Список» — крупно, для чтения издалека: пункты с номерами, подпункты точками под ними;
 *    колонки, кегль и страницы — по весу веток (`listLayout`); страницы листаются сами раз в
 *    20 с по часам киоска.
 *  - «Карта» — название в центре, пункты ветвями вокруг, подпункты листьями (`mapLayout`).
 *    Больше двенадцати ветвей — всё равно список (`mapFits`).
 * Ведущий с пульта подсвечивает пункт: он на подложке, остальные гаснут, стена стоит на его
 * странице, сверху — «3 / 7» и шкала пунктов. Отмеченный гаснет с галочкой на своём месте;
 * только что сказанный минуту мягко светится. Рядом с поручённым — нейтральное «→ Марат»
 * (D-45). При госте доски нет — часы и «скрыта» (D-33). Движение — только opacity и transform.
 */
export function TvBoard({ data, now }: { data: TvBoardData | null; now: Date }) {
  const aspect = useSyncExternalStore(subscribeResize, clientAspect, serverAspect);
  const still = useReducedMotion() ?? false;
  const frame = useMemo(() => boardFrame(aspect), [aspect]);
  const board = data?.hidden ? null : (data?.board ?? null);
  const items = board?.items;
  const title = board?.title ?? "";
  const wantMap = board ? wallView(board) === "map" : false;

  // the map keeps a margin on both sides: the spotlit branch grows a little and must stay on the board
  const map = useMemo(
    () => (wantMap && items ? mapLayout(title, items, { width: frame.width - MAP_MARGIN * 2, height: frame.height }) : null),
    [wantMap, items, title, frame],
  );
  const heading = useMemo(() => titleFit(title, frame.width), [title, frame]);
  const list = useMemo(
    () => (!map && items ? listLayout(items, { width: frame.width, height: frame.height - heading.lines * heading.lh - BOARD_TITLE_GAP }) : null),
    [map, items, frame, heading],
  );

  if (data?.hidden) return <Hidden now={now} />;
  if (!board) return null;

  const focus = board.focus;
  const pages = list?.pages.length ?? 1;
  const page = pageAt(now, pages, list ? pageOfPoint(list, focus) : null);
  const fresh = freshKey(board.items, now);
  const view = map ? "map" : "list";

  return (
    <div
      className="flex flex-col"
      style={{ width: vh(frame.width), height: vh(BOARD_HEIGHT) }}
      data-testid="tv-board"
      data-view={view}
      data-focus={focus ?? undefined}
    >
      <TopRow board={board} page={page} pages={pages} />
      <div className="relative" style={{ marginTop: vh(BOARD_TOP_GAP), height: vh(frame.height) }}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={view}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: still ? 1 : 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: still ? 1 : 0.99, transition: { duration: still ? 0 : 0.28 } }}
            transition={{ duration: still ? 0 : 0.5, ease: EASE }}
          >
            {map ? (
              <TvBoardMap layout={map} title={board.title} focus={focus} fresh={fresh} still={still} />
            ) : list ? (
              <TvBoardList layout={list} title={board.title} heading={heading} page={page} focus={focus} fresh={fresh} still={still} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * Строка над доской: «ДОСКА» слева; справа — счёт пунктов, а пока ведущий ведёт совещание —
 * «3 / 7» и шкала пунктов с отметкой текущего. Обе надписи стоят в одной клетке и
 * сменяются прозрачностью — строка не прыгает.
 */
function TopRow({ board, page, pages }: { board: Board; page: number; pages: number }) {
  const at = board.focus ? board.items.findIndex((item) => item.id === board.focus) : -1;
  const walking = at >= 0;
  return (
    <div className="flex shrink-0 items-center justify-between gap-[4vh]" style={{ height: vh(BOARD_TOP_ROW) }}>
      <p className="font-display text-[2.4vh] font-semibold uppercase leading-[3vh] tracking-[0.14em]" style={{ color: "var(--accent)" }}>
        Доска
      </p>
      <div className="flex items-center gap-[3vh]">
        <div className="grid justify-items-end [grid-template-areas:'cell'] *:[grid-area:cell]">
          <span
            className="nums self-center text-[3vh] font-semibold leading-[4vh] text-muted"
            style={{ opacity: walking ? 0 : 1, transition: "opacity 450ms var(--ease-in-out)" }}
            aria-hidden={walking}
          >
            {boardCountLine(board)}
          </span>
          <Progress board={board} at={at} on={walking} />
        </div>
        {pages > 1 ? <PageDots page={page} pages={pages} /> : null}
      </div>
    </div>
  );
}

/** «3 / 7» и шкала: по сегменту на пункт, текущий — акцентом и шире, отмеченные — тише. */
function Progress({ board, at, on }: { board: Board; at: number; on: boolean }) {
  const count = board.items.length;
  // the scale never gets wider than a fifth of the row, whatever the number of points
  const segment = Math.min(3.2, Math.max(0.9, (34 - 0.5 * (count - 1)) / Math.max(count, 1)));
  return (
    <div
      className="flex items-center gap-[2vh] self-center"
      style={{ opacity: on ? 1 : 0, transition: "opacity 450ms var(--ease-in-out)" }}
      aria-hidden={!on}
      data-testid="tv-board-progress"
    >
      <span className="flex items-center gap-[0.5vh]">
        {board.items.map((item, index) => (
          <span
            key={item.id}
            className="block rounded-full"
            style={{
              width: vh(index === at ? segment * 1.6 : segment),
              height: vh(index === at ? 0.9 : 0.6),
              background:
                index === at ? "var(--accent)" : item.done ? "color-mix(in srgb, var(--ok) 55%, transparent)" : "color-mix(in srgb, var(--text-muted) 38%, transparent)",
              transition: "background-color 450ms var(--ease-in-out)",
            }}
          />
        ))}
      </span>
      <span className="nums text-[3.4vh] font-bold leading-[4vh] tabular-nums">
        {on ? at + 1 : 1}
        <span className="text-muted"> / {count}</span>
      </span>
    </div>
  );
}

/** Точки страниц — как у карточки сотрудника: текущая светлая, меняется только цвет. */
function PageDots({ page, pages }: { page: number; pages: number }) {
  return (
    <span className="flex items-center gap-[1vh]" aria-label={`Страница ${page + 1} из ${pages}`} data-testid="tv-board-page">
      {Array.from({ length: pages }, (_, index) => (
        <span
          key={index}
          className="h-[1.2vh] w-[1.2vh] rounded-full"
          style={{ background: index === page ? "var(--text)" : "var(--border)", transition: "background-color 400ms var(--ease-in-out)" }}
        />
      ))}
    </span>
  );
}

/** «Гость в кабинете»: доски нет — тихие часы и честная строка (D-33). */
function Hidden({ now }: { now: Date }) {
  return (
    <div className="flex flex-col items-center gap-[2vh]" data-testid="tv-board-hidden">
      <p className="nums text-[18vh] font-bold leading-[20vh] tabular-nums">{tvTime(now)}</p>
      <p className="text-[3.4vh] leading-[4.4vh] text-muted">Доска скрыта · гость в кабинете</p>
    </div>
  );
}

/* The wall's proportions: 16:9 on a TV, anything on a laptop peeking at /tv. Rounded, so a
   1080p screen matches the server's 16:9 and hydration draws the same board. */
function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const round = (value: number) => Math.round(value * 100) / 100;
const clientAspect = () => round(window.innerWidth / Math.max(window.innerHeight, 1));
const serverAspect = () => round(16 / 9);
