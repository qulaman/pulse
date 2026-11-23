"use client";

import { AnimatePresence, motion } from "motion/react";
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
  PROGRESS_GAP,
  PROGRESS_H,
  PROGRESS_THUMB_H,
  progressScale,
  wallView,
  type TvBoard as TvBoardData,
  type TvBoardData as Board,
} from "@/lib/tv/board";
import { listLayout, pageOfPoint, titleFit } from "@/lib/tv/boardList";
import { mapLayout } from "@/lib/tv/boardMap";
import { tvTime } from "@/lib/tv/clock";

import "./tv-type.css";

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
 *    More than six branches — a list all the same (`MAP_BRANCHES_MAX`, D-185).
 * The presenter on the remote lights a point: it sits on the «сейчас» mark (`.tv-now`), the others dim,
 * the wall stays on its page, with «3 / 7» and the points' scale on top. A checked point dims with a tick
 * in its place; the one just said breathes with the same mark for a minute. Under a handed point — the
 * «→ Марат» plate (D-45, D-185). No text is smaller than `tv-small`, except the numerals in the circles.
 * With a guest there is no board — a quiet clock with no service caption (D-33, D-185). Motion is opacity
 * and transform only.
 */
export function TvBoard({ data, now, aspect: fixed }: { data: TvBoardData | null; now: Date; aspect?: number }) {
  // the preview on the phone (D-140) draws the wall's own proportions, not the phone's
  const screen = useSyncExternalStore(subscribeResize, clientAspect, serverAspect);
  const aspect = fixed ?? screen;
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
            // another view, or the map on another step of its scale, crossfades as a whole: type never resizes in view
            key={map ? `map-${map.tier.key}` : "list"}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.99, transition: { duration: 0.28 } }}
            transition={{ duration: 0.5, ease: EASE }}
          >
            {map ? (
              <TvBoardMap layout={map} title={board.title} focus={focus} fresh={fresh} />
            ) : list ? (
              <TvBoardList layout={list} title={board.title} heading={heading} page={page} focus={focus} fresh={fresh} />
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/**
 * The line above the board: «Доска» on the left, like the name of any scene (D-185); on the right the item count, and
 * while the presenter runs a meeting, «3 / 7» and a scale of items with the current one marked. Both labels sit in one
 * cell and swap by opacity — the line does not jump.
 */
function TopRow({ board, page, pages }: { board: Board; page: number; pages: number }) {
  const at = board.focus ? board.items.findIndex((item) => item.id === board.focus) : -1;
  const walking = at >= 0;
  return (
    <div className="flex shrink-0 items-center justify-between gap-[4vh]" style={{ height: vh(BOARD_TOP_ROW) }}>
      <p className="tv-small font-semibold" style={{ color: "var(--tv-text)" }}>
        {board.week ? "Доска недели" : "Доска"}
      </p>
      <div className="flex items-center gap-[3vh]">
        <div className="grid justify-items-end [grid-template-areas:'cell'] *:[grid-area:cell]">
          <span
            className="tv-small tv-num self-center text-muted"
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

/**
 * «3 / 7» и шкала: по сегменту на пункт, отмеченные — тише; текущий — акцентная капсула
 * поверх шкалы, она переезжает к следующему пункту (transform), шкала под ней не меняется.
 * Число — в клетке на все разряды: «9 → 10» не сдвигает шкалу.
 */
function Progress({ board, at, on }: { board: Board; at: number; on: boolean }) {
  const count = board.items.length;
  const scale = progressScale(count, at);
  return (
    <div
      className="flex items-center gap-[2vh] self-center"
      style={{ opacity: on ? 1 : 0, transition: "opacity 450ms var(--ease-in-out)" }}
      aria-hidden={!on}
      data-testid="tv-board-progress"
    >
      <span className="relative flex items-center" style={{ gap: vh(PROGRESS_GAP), height: vh(PROGRESS_THUMB_H) }}>
        {board.items.map((item) => (
          <span
            key={item.id}
            className="block rounded-full"
            style={{
              width: vh(scale.segment),
              height: vh(PROGRESS_H),
              background: item.done ? "color-mix(in srgb, var(--tv-text) 55%, transparent)" : "color-mix(in srgb, var(--text-muted) 38%, transparent)",
            }}
          />
        ))}
        <span
          aria-hidden
          className="absolute left-0 top-0 block rounded-full"
          style={{
            width: vh(scale.thumb),
            height: vh(PROGRESS_THUMB_H),
            background: "var(--tv-live)",
            // a ring of the wall's own colour: the capsule sits on the scale, not in a gap of it
            boxShadow: "0 0 0 0.3vh var(--bg)",
            transform: `translateX(${vh(scale.shift)})`,
            transition: "transform 450ms var(--ease-in-out)",
          }}
          data-testid="tv-board-progress-thumb"
        />
      </span>
      <span className="tv-small tv-num font-bold">
        <span className="inline-block text-right" style={{ minWidth: `${String(count).length}ch` }}>
          {on ? at + 1 : 1}
        </span>
        <span className="text-muted"> / {count}</span>
      </span>
    </div>
  );
}

/** Точки страниц — как у карточки сотрудника: светлая точка переезжает к текущей странице (transform). */
function PageDots({ page, pages }: { page: number; pages: number }) {
  return (
    <span className="relative flex items-center gap-[1vh]" aria-label={`Страница ${page + 1} из ${pages}`} data-testid="tv-board-page">
      {Array.from({ length: pages }, (_, index) => (
        <span key={index} className="h-[1.2vh] w-[1.2vh] rounded-full" style={{ background: "var(--border)" }} />
      ))}
      <span
        aria-hidden
        className="absolute left-0 top-0 h-[1.2vh] w-[1.2vh] rounded-full"
        style={{ background: "var(--text)", transform: `translateX(${vh(page * 2.2)})`, transition: "transform 400ms var(--ease-in-out)" }}
      />
    </span>
  );
}

/**
 * A guest in the office: no board — only a quiet clock. No service caption: a guest is not told that
 * something is hidden from them (D-33, D-185).
 */
function Hidden({ now }: { now: Date }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center" data-testid="tv-board-hidden">
      <p className="tv-hero tv-num" style={{ color: "var(--tv-text)" }}>
        {tvTime(now)}
      </p>
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
