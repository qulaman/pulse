"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo } from "react";

import { SketchView } from "@/components/mindboard/SketchView";
import { shownRatio } from "@/lib/mindboard/sketch";
import { BOARD_TITLE_GAP, wallText } from "@/lib/tv/board";
import { COLUMN_GAP, textTop, type ListLayout, type ListRow, type ListTier, type TitleFit } from "@/lib/tv/boardList";

import { Badge, clampStyle, DIM, DONE_TEXT, EASE, FreshGlow, LEAF_INK, LINE_INK, LitPlate, TagPlate, vh } from "./TvBoardParts";

/**
 * The board's «Список» on the wall (D-102 §8, D-121, D-185): the title large, numbered points, sub-points
 * as dots under their point, indented. Type size, columns and pages are chosen by `listLayout` by the
 * weight of the branches, only from the wall's scale — a point `tv-body` or `tv-small`, a sub-point and
 * «→ Марат» `tv-small`; here are only the same numbers in vh. The presenter lit a point — it sits on the
 * «сейчас» mark (`.tv-now`) and a little larger, the others dim; the page is the one it is on. Without a
 * presenter the same mark breathes for a minute on the point just said.
 */
export const TvBoardList = memo(function TvBoardList({
  layout,
  title,
  heading,
  page,
  focus,
  fresh,
}: {
  layout: ListLayout;
  title: string;
  heading: TitleFit;
  page: number;
  focus: string | null;
  /** Свежие пункты и подпункты одной строкой id (`freshKey`). */
  fresh: string;
}) {
  const tier = layout.tier;
  const columns = layout.pages[Math.min(page, layout.pages.length - 1)] ?? [];
  const freshIds = new Set(fresh ? fresh.split(",") : []);
  const empty = layout.pages.every((p) => p.every((column) => column.length === 0));

  return (
    <div className="flex h-full flex-col" data-testid="tv-board-list" data-tier={tier.key} data-columns={layout.columns}>
      <h2
        className="shrink-0 font-bold tracking-[-0.02em] [text-wrap:balance]"
        style={{ fontSize: vh(heading.size), lineHeight: vh(heading.lh), ...clampStyle(heading.lines, heading.lh), color: "var(--tv-text)" }}
        data-testid="tv-board-title"
      >
        {title}
      </h2>

      {empty ? (
        <Empty />
      ) : (
        <div className="relative min-h-0 flex-1" style={{ marginTop: vh(BOARD_TITLE_GAP) }}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              // a new size or another page crossfades as a whole: nothing reflows in view
              key={`${tier.key}-${layout.columns}-${page}`}
              className="grid items-start"
              style={{ gridTemplateColumns: layout.columns === 2 ? "minmax(0,1fr) minmax(0,1fr)" : "minmax(0,1fr)", columnGap: vh(COLUMN_GAP) }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ duration: 0.5, ease: EASE }}
              data-page={page}
            >
              {columns.map((column, index) => (
                <ol key={index} className="flex min-w-0 flex-col" style={{ gap: vh(tier.rowGap) }}>
                  {column.map((row) => (
                    <Branch
                      key={row.item.id}
                      row={row}
                      tier={tier}
                      lit={focus === row.item.id}
                      dim={focus !== null && focus !== row.item.id}
                      freshIds={freshIds}
                    />
                  ))}
                </ol>
              ))}
            </motion.div>
          </AnimatePresence>
        </div>
      )}
    </div>
  );
});

function Branch({ row, tier, lit, dim, freshIds }: { row: ListRow; tier: ListTier; lit: boolean; dim: boolean; freshIds: Set<string> }) {
  const { item } = row;
  const fresh = freshIds.has(item.id);
  return (
    <motion.li
      // a point said a moment ago rises into its place; the others stay where they are (no layout animation, D-185)
      initial={{ opacity: 0, y: "1.6vh" }}
      animate={{ opacity: 1, y: "0vh" }}
      transition={{ duration: 0.5, ease: EASE }}
      className="relative"
      data-point={item.id}
      data-lit={lit || undefined}
      data-done={item.done || undefined}
      data-fresh={fresh || undefined}
    >
      <motion.div
        className="relative"
        style={{ transformOrigin: "left center" }}
        initial={false}
        animate={{ opacity: dim ? DIM : 1, scale: lit ? 1.02 : 1 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <LitPlate on={lit} />
        <AnimatePresence>{fresh && !lit ? <FreshGlow key="glow" /> : null}</AnimatePresence>
        <div className="relative flex items-start" style={{ padding: `${vh(tier.padY)} ${vh(tier.padX)}`, gap: vh(tier.gap) }}>
          <Badge n={row.n} done={item.done} size={tier.badge} />
          <div className="min-w-0 flex-1" style={{ paddingTop: vh(textTop(tier)) }}>
            <p
              className="font-semibold tracking-[-0.01em] [text-wrap:pretty]"
              style={{ fontSize: vh(tier.size), lineHeight: vh(tier.lh), ...clampStyle(row.lines, tier.lh), color: "var(--tv-text)", opacity: item.done ? DONE_TEXT : 1 }}
            >
              {wallText(item)}
            </p>
            {row.tag ? (
              // the plate on a line of its own: whom it went to is never cut by the clamp of the words
              <div className="flex" style={{ marginTop: vh(tier.tagTop) }}>
                <TagPlate tag={row.tag} pad={tier.tagPad} done={item.done} />
              </div>
            ) : null}
            {row.thumb > 0 && item.sketch ? (
              // the drawing in small (D-141); lit by the presenter, it opens over the whole wall
              <div
                className="overflow-hidden"
                style={{
                  marginTop: vh(tier.subTop),
                  width: vh(row.thumb * shownRatio(item.sketch)),
                  height: vh(row.thumb),
                  borderRadius: vh(1.2),
                  background: "color-mix(in srgb, var(--surface) 70%, var(--bg))",
                  opacity: item.done ? DONE_TEXT + 0.1 : 1,
                }}
                data-testid="tv-board-thumb"
              >
                <SketchView sketch={item.sketch} label={wallText(item)} />
              </div>
            ) : null}
            {row.children.length > 0 || row.more > 0 ? (
              <ul className="flex flex-col" style={{ marginTop: vh(tier.subTop), gap: vh(tier.subGap), opacity: item.done ? 0.6 : 1 }}>
                {row.children.map(({ leaf, lines, tag }) => (
                  <li
                    key={leaf.id}
                    // as wide as its words: the glow of a sub-point just said hugs it instead of running to the column's edge
                    className="relative flex max-w-full items-start self-start"
                    style={{ gap: vh(tier.dotGap) }}
                    data-leaf={leaf.id}
                    data-done={leaf.done || undefined}
                  >
                    <AnimatePresence>{freshIds.has(leaf.id) ? <FreshGlow key="glow" inset={`${vh(-0.3)} ${vh(-1)}`} /> : null}</AnimatePresence>
                    <span
                      aria-hidden
                      className="relative shrink-0 rounded-full"
                      style={{
                        width: vh(tier.dot),
                        height: vh(tier.dot),
                        marginTop: vh((tier.subLh - tier.dot) / 2),
                        background: leaf.done ? "color-mix(in srgb, var(--text-muted) 40%, var(--bg))" : LINE_INK,
                      }}
                    />
                    <span className="relative min-w-0 flex-1">
                      <span
                        className="block font-medium [text-wrap:pretty]"
                        style={{
                          fontSize: vh(tier.sub),
                          lineHeight: vh(tier.subLh),
                          ...clampStyle(lines, tier.subLh),
                          color: LEAF_INK,
                          opacity: leaf.done ? DONE_TEXT + 0.08 : 1,
                        }}
                      >
                        {wallText(leaf)}
                      </span>
                      {tag ? (
                        <span className="flex" style={{ marginTop: vh(tier.tagTop) }}>
                          <TagPlate tag={tag} pad={tier.tagPad} done={leaf.done} />
                        </span>
                      ) : null}
                    </span>
                  </li>
                ))}
                {row.more > 0 ? (
                  <li className="text-muted" style={{ paddingLeft: vh(tier.dot + tier.dotGap), fontSize: vh(tier.sub), lineHeight: vh(tier.subLh) }}>
                    + ещё {row.more}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>
      </motion.div>
    </motion.li>
  );
}

/**
 * Пустая доска: где встанут пункты — показано тихими строками-заготовками, чтобы стена не
 * выглядела сломанной, пока директор диктует первый пункт.
 */
function Empty() {
  return (
    <motion.div
      className="flex flex-1 flex-col justify-center gap-[2.6vh] pb-[4vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6, delay: 0.15, ease: EASE }}
      data-testid="tv-board-empty"
    >
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-[2.6vh] px-[2.4vh]" style={{ opacity: n === 1 ? 1 : n === 2 ? 0.55 : 0.3 }}>
          <Badge n={n} done={false} size={6.2} />
          {n === 1 ? (
            <p className="tv-small font-semibold text-muted">Пункты появятся здесь, как только их скажут</p>
          ) : (
            <span aria-hidden className="h-[1.6vh] rounded-full" style={{ width: n === 2 ? "46vh" : "30vh", background: "color-mix(in srgb, var(--text-muted) 30%, var(--bg))" }} />
          )}
        </div>
      ))}
    </motion.div>
  );
}
