"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { boardCountLine, boardLayout, isFresh, pageAt, pageItems, tagOf, type TvBoard as TvBoardData } from "@/lib/tv/board";
import { tvTime } from "@/lib/tv/clock";

/**
 * Заставка «Доска» (D-102 §8): пункты директора на стене кабинета. Название крупно, пункты
 * с номерами: до шести — одна колонка крупно, до четырнадцати — две, дальше страницы, они
 * листаются сами раз в 20 секунд по часам киоска. Отмеченный пункт гаснет с галочкой и
 * остаётся на своём месте; только что сказанный минуту мягко светится. Рядом с поручённым —
 * только нейтральное «→ Марат» (D-45). При госте в кабинете доски нет — часы и «скрыта»
 * (D-33). Движение — только opacity и transform.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvBoard({ data, now }: { data: TvBoardData | null; now: Date }) {
  if (data?.hidden) return <Hidden now={now} />;
  const board = data?.board ?? null;
  if (!board) return null;

  const layout = boardLayout(board.items.length);
  const page = pageAt(now, layout.pages);
  const rows = pageItems(board.items, layout, page);
  const big = layout.columns === 1;

  return (
    <div className="flex w-full max-w-[92vw] flex-col" data-testid="tv-board" data-columns={layout.columns}>
      <header className="flex items-end justify-between gap-[4vh]">
        <div className="min-w-0">
          <p className="font-display text-[2.4vh] font-semibold uppercase leading-[3vh] tracking-[0.14em]" style={{ color: "var(--accent)" }}>
            Доска
          </p>
          <h2 className="mt-[0.6vh] line-clamp-1 text-[7vh] font-bold leading-[8vh] tracking-[-0.03em]" data-testid="tv-board-title">
            {board.title}
          </h2>
        </div>
        <span className="shrink-0 pb-[1vh] text-[3vh] font-semibold leading-[4vh] text-muted">{boardCountLine(board)}</span>
      </header>

      {board.items.length === 0 ? (
        <p className="mt-[6vh] text-[4vh] leading-[5vh] text-muted">Пункты появятся здесь, как только их скажут</p>
      ) : (
        // pages keep the height of a full one: the title must not jump when a short page comes
        <div style={layout.pages > 1 ? { minHeight: "54vh" } : undefined}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.ol
              key={page}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: 0.5, ease: EASE }}
              className={`mt-[3.6vh] ${big ? "flex flex-col gap-[1.6vh]" : "grid grid-flow-col gap-x-[4vh] gap-y-[1.2vh]"}`}
              style={big ? undefined : { gridTemplateRows: `repeat(${Math.ceil(rows.length / 2)}, auto)`, gridTemplateColumns: "1fr 1fr" }}
            >
              {rows.map(({ item, n }) => (
                <Point key={item.id} n={n} text={item.text} done={item.done} tag={tagOf(item)} fresh={isFresh(item, now)} big={big} />
              ))}
            </motion.ol>
          </AnimatePresence>
        </div>
      )}

      {layout.pages > 1 ? (
        <p className="nums mt-[2.4vh] text-center text-[2.4vh] leading-[3vh] text-muted" data-testid="tv-board-page">
          {page + 1} / {layout.pages}
        </p>
      ) : null}
    </div>
  );
}

function Point({ n, text, done, tag, fresh, big }: { n: number; text: string; done: boolean; tag: string | null; fresh: boolean; big: boolean }) {
  const still = useReducedMotion();
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className={`relative flex items-start rounded-[2vh] ${big ? "gap-[2.6vh] px-[2.4vh] py-[1.4vh]" : "gap-[2vh] px-[2vh] py-[1vh]"}`}
      data-done={done || undefined}
      data-fresh={fresh || undefined}
    >
      {fresh ? (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[2vh]"
          style={{ background: "color-mix(in srgb, var(--accent) 14%, transparent)", boxShadow: "inset 0 0 0 0.2vh color-mix(in srgb, var(--accent) 45%, transparent)" }}
          initial={{ opacity: 0 }}
          animate={still ? { opacity: 0.8 } : { opacity: [0.35, 0.95, 0.35] }}
          transition={still ? { duration: 0.3 } : { duration: 2.6, repeat: Infinity, ease: "easeInOut" }}
        />
      ) : null}
      <span
        aria-hidden
        className={`nums relative flex shrink-0 items-center justify-center rounded-full font-bold ${big ? "h-[6.4vh] w-[6.4vh] text-[3.4vh]" : "h-[4.6vh] w-[4.6vh] text-[2.5vh]"}`}
        style={{
          color: done ? "var(--ok)" : "var(--accent)",
          background: `color-mix(in srgb, ${done ? "var(--ok)" : "var(--accent)"} 16%, transparent)`,
        }}
      >
        {done ? (
          <svg viewBox="0 0 24 24" width="55%" height="55%" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12.5 10 17.5 19 7" />
          </svg>
        ) : (
          n
        )}
      </span>
      <span className="relative min-w-0 flex-1">
        <span
          className={`line-clamp-2 font-semibold tracking-[-0.015em] ${big ? "text-[4.4vh] leading-[5.6vh]" : "text-[3.1vh] leading-[4.1vh]"}`}
          style={{ opacity: done ? 0.42 : 1 }}
        >
          {text}
        </span>
        {tag ? (
          <span className={`mt-[0.4vh] block font-semibold ${big ? "text-[2.6vh] leading-[3.2vh]" : "text-[2.1vh] leading-[2.6vh]"}`} style={{ color: "var(--accent)" }}>
            {tag}
          </span>
        ) : null}
      </span>
    </motion.li>
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
