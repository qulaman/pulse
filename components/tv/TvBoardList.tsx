"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";

import { BOARD_TITLE_GAP } from "@/lib/tv/board";
import { COLUMN_GAP, textTop, type ListLayout, type ListRow, type ListTier, type TitleFit } from "@/lib/tv/boardList";

import { Badge, clampStyle, DIM, DONE_TEXT, EASE, FreshGlow, LitPlate, vh } from "./TvBoardParts";

/**
 * «Список» доски на стене (D-102 §8, D-121): название крупно, пункты с номерами, подпункты —
 * точками под своим пунктом, мельче и с отступом. Кегль, колонки и страницы решает
 * `listLayout` по весу веток; здесь только те же числа в vh. Ведущий подсветил пункт —
 * он на подложке и чуть крупнее, остальные гаснут; страница — та, где он.
 */
export const TvBoardList = memo(function TvBoardList({
  layout,
  title,
  heading,
  page,
  focus,
  fresh,
  still,
}: {
  layout: ListLayout;
  title: string;
  heading: TitleFit;
  page: number;
  focus: string | null;
  /** Свежие пункты и подпункты одной строкой id (`freshKey`). */
  fresh: string;
  still: boolean;
}) {
  const tier = layout.tier;
  const columns = layout.pages[Math.min(page, layout.pages.length - 1)] ?? [];
  const freshIds = new Set(fresh ? fresh.split(",") : []);
  const empty = layout.pages.every((p) => p.every((column) => column.length === 0));

  return (
    <div className="flex h-full flex-col" data-testid="tv-board-list" data-tier={tier.key} data-columns={layout.columns}>
      <h2
        className="shrink-0 font-bold tracking-[-0.03em] [overflow-wrap:anywhere] [text-wrap:balance]"
        style={{ fontSize: vh(heading.size), lineHeight: vh(heading.lh), ...clampStyle(heading.lines) }}
        data-testid="tv-board-title"
      >
        {title}
      </h2>

      {empty ? (
        <Empty still={still} />
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
              exit={{ opacity: 0, transition: { duration: 0.3 } }}
              transition={{ duration: still ? 0 : 0.5, ease: EASE }}
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
                      still={still}
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

function Branch({ row, tier, lit, dim, freshIds, still }: { row: ListRow; tier: ListTier; lit: boolean; dim: boolean; freshIds: Set<string>; still: boolean }) {
  const { item } = row;
  const fresh = freshIds.has(item.id);
  const radius = vh(tier.badge * 0.42);
  return (
    <motion.li
      layout={still ? false : "position"}
      initial={{ opacity: 0, y: still ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: still ? 0 : 0.5, ease: EASE }}
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
        animate={{ opacity: dim ? DIM : 1, scale: lit && !still ? 1.02 : 1 }}
        transition={{ duration: still ? 0 : 0.5, ease: EASE }}
      >
        <LitPlate on={lit} radius={radius} still={still} />
        <AnimatePresence>{fresh ? <FreshGlow key="glow" radius={radius} still={still} /> : null}</AnimatePresence>
        <div className="relative flex items-start" style={{ padding: `${vh(tier.padY)} ${vh(tier.padX)}`, gap: vh(tier.gap) }}>
          <Badge n={row.n} done={item.done} size={tier.badge} lit={lit} />
          <div className="min-w-0 flex-1" style={{ paddingTop: vh(textTop(tier)) }}>
            <p
              className="font-semibold tracking-[-0.015em] [overflow-wrap:anywhere] [text-wrap:pretty]"
              style={{ fontSize: vh(tier.size), lineHeight: vh(tier.lh), ...clampStyle(row.lines), opacity: item.done ? DONE_TEXT : 1 }}
            >
              {item.text}
            </p>
            {row.tag ? (
              <p className="font-semibold" style={{ marginTop: vh(tier.tagTop), fontSize: vh(tier.tag), lineHeight: vh(tier.tagLh), color: "var(--accent)" }}>
                {row.tag}
              </p>
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
                    <AnimatePresence>
                      {freshIds.has(leaf.id) ? <FreshGlow key="glow" radius={vh(1)} still={still} inset={`${vh(-0.3)} ${vh(-1)}`} /> : null}
                    </AnimatePresence>
                    <span
                      aria-hidden
                      className="relative shrink-0 rounded-full"
                      style={{
                        width: vh(tier.dot),
                        height: vh(tier.dot),
                        marginTop: vh((tier.subLh - tier.dot) / 2),
                        background: leaf.done ? "var(--ok)" : "color-mix(in srgb, var(--accent) 75%, var(--text-muted))",
                      }}
                    />
                    <span
                      className="relative min-w-0 flex-1 font-medium [overflow-wrap:anywhere] [text-wrap:pretty]"
                      style={{
                        fontSize: vh(tier.sub),
                        lineHeight: vh(tier.subLh),
                        ...clampStyle(lines),
                        color: "color-mix(in srgb, var(--text) 86%, var(--text-muted))",
                        opacity: leaf.done ? DONE_TEXT + 0.08 : 1,
                      }}
                    >
                      {leaf.text}
                      {tag ? (
                        <span className="font-semibold" style={{ color: "var(--accent)" }}>
                          {" "}
                          {tag}
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
function Empty({ still }: { still: boolean }) {
  return (
    <motion.div
      className="flex flex-1 flex-col justify-center gap-[2.6vh] pb-[4vh]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: still ? 0 : 0.6, delay: still ? 0 : 0.15, ease: EASE }}
      data-testid="tv-board-empty"
    >
      {[1, 2, 3].map((n) => (
        <div key={n} className="flex items-center gap-[2.6vh] px-[2.4vh]" style={{ opacity: n === 1 ? 1 : n === 2 ? 0.55 : 0.3 }}>
          <span
            aria-hidden
            className="nums flex h-[6.2vh] w-[6.2vh] shrink-0 items-center justify-center rounded-full text-[3vh] font-bold"
            style={{ color: "var(--accent)", boxShadow: "inset 0 0 0 0.2vh color-mix(in srgb, var(--accent) 45%, transparent)" }}
          >
            {n}
          </span>
          {n === 1 ? (
            <p className="text-[4vh] font-semibold leading-[5vh] text-muted">Пункты появятся здесь, как только их скажут</p>
          ) : (
            <span aria-hidden className="h-[1.6vh] rounded-full" style={{ width: n === 2 ? "46vh" : "30vh", background: "color-mix(in srgb, var(--border) 80%, transparent)" }} />
          )}
        </div>
      ))}
    </motion.div>
  );
}
