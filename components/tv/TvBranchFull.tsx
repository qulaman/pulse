"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

import { tagOf, wallText, zoomedBranch, type TvBoardData, type TvBoardLeaf } from "@/lib/tv/board";

import { Badge, clampStyle, DONE_TEXT, EASE, vh } from "./TvBoardParts";

/** The leaves of a zoomed branch: one column while they are few, two after; past twelve — «+ ещё N». */
const ONE_COLUMN = 5;
const MAX_LEAVES = 12;

type LeafType = { columns: number; lines: number; size: number; lh: number; tag: number; tagLh: number; gap: number; dot: number };

/**
 * Type of the leaves by their count, vh: the fewer, the larger — read from the door; the tag a
 * size below, on a line of its own. Up to three rows a leaf keeps two lines, more rows — one:
 * the worst case (a two-line title with its tag, every leaf long and handed) stays inside the
 * ~69 vh under the title.
 */
function leafType(count: number): LeafType {
  const columns = count > ONE_COLUMN ? 2 : 1;
  const lines = Math.ceil(count / columns) <= 3 ? 2 : 1;
  if (count <= 3) return { columns, lines, size: 6.2, lh: 7.4, tag: 4.2, tagLh: 5.2, gap: 3.4, dot: 1.8 };
  if (count <= ONE_COLUMN) return { columns, lines, size: 5.4, lh: 6.6, tag: 3.8, tagLh: 4.8, gap: 2.8, dot: 1.6 };
  if (count <= 10) return { columns, lines, size: 4.8, lh: 6, tag: 3.4, tagLh: 4.4, gap: 3, dot: 1.4 };
  return { columns, lines, size: 3.6, lh: 4.6, tag: 2.8, tagLh: 3.6, gap: 1.6, dot: 1.1 };
}

/**
 * A branch over the whole wall (D-144): on the map the presenter lit a point with sub-points —
 * the point's words on top, its sub-points as large leaves, their names and stages beside
 * them; the next step of the presenter gives the map back. A drawing opens as the drawing
 * (`TvSketchFull`), the list keeps its own light. The same layer sits in the wall's miniature on
 * the phone (WallPreview). A visitor's notice still stands above it. Opacity only (D-45).
 */
export function TvBranchFull({ board }: { board: TvBoardData | null }) {
  const still = useReducedMotion() ?? false;
  const zoom = zoomedBranch(board);
  const item = zoom?.item;
  const leaves = item?.children ?? [];
  const shown = leaves.slice(0, MAX_LEAVES);
  const more = leaves.length - shown.length;
  // «+ ещё N» takes a cell of its own
  const type = leafType(shown.length + (more > 0 ? 1 : 0));
  const columns = type.columns;
  const tag = item ? tagOf(item) : null;

  return (
    <AnimatePresence>
      {item && zoom ? (
        <motion.div
          key={item.id}
          className="absolute inset-0 z-[15] flex flex-col bg-bg px-[6vh] pb-[4vh] pt-[2.6vh]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.35, ease: EASE }}
          data-testid="tv-board-branch"
          data-point={item.id}
        >
          <div className="flex shrink-0 items-start gap-[2.4vh]">
            <span className="mt-[0.6vh]">
              <Badge n={zoom.at + 1} done={item.done} size={7.2} lit />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="font-semibold tracking-[-0.02em] [overflow-wrap:anywhere] [text-wrap:balance]"
                style={{ fontSize: vh(6.4), lineHeight: vh(7.8), ...clampStyle(2), opacity: item.done ? DONE_TEXT : 1 }}
              >
                {wallText(item)}
              </p>
              {tag ? (
                <p className="mt-[0.6vh] text-[3.2vh] font-semibold leading-[4vh]" style={{ color: "var(--accent)" }}>
                  {tag}
                </p>
              ) : null}
            </div>
            <span className="nums mt-[1.6vh] shrink-0 text-[3vh] font-semibold leading-[4vh] text-muted">
              {zoom.at + 1} / {board?.items.length ?? 0}
            </span>
          </div>

          <ul
            className="mt-[4vh] grid min-h-0 flex-1 content-center"
            style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`, columnGap: vh(7), rowGap: vh(type.gap), paddingLeft: vh(9.6) }}
            data-testid="tv-board-branch-leaves"
          >
            {shown.map((leaf) => (
              <Leaf key={leaf.id} leaf={leaf} type={type} />
            ))}
            {more > 0 ? (
              <li className="text-muted" style={{ paddingLeft: vh(type.dot + 2), fontSize: vh(type.size), lineHeight: vh(type.lh) }}>
                + ещё {more}
              </li>
            ) : null}
          </ul>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

function Leaf({ leaf, type }: { leaf: TvBoardLeaf; type: LeafType }) {
  const tag = tagOf(leaf);
  return (
    <li className="flex min-w-0 items-start" style={{ gap: vh(2) }} data-leaf={leaf.id} data-done={leaf.done || undefined}>
      <span
        aria-hidden
        className="shrink-0 rounded-full"
        style={{
          width: vh(type.dot),
          height: vh(type.dot),
          marginTop: vh((type.lh - type.dot) / 2),
          background: leaf.done ? "var(--ok)" : "color-mix(in srgb, var(--accent) 75%, var(--text-muted))",
        }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block font-medium [overflow-wrap:anywhere] [text-wrap:pretty]"
          style={{ fontSize: vh(type.size), lineHeight: vh(type.lh), ...clampStyle(type.lines), opacity: leaf.done ? DONE_TEXT + 0.08 : 1 }}
        >
          {wallText(leaf)}
        </span>
        {/* whom and how far, on a line of its own: never cut by the clamp of the words */}
        {tag ? (
          <span className="block font-semibold" style={{ fontSize: vh(type.tag), lineHeight: vh(type.tagLh), color: "var(--accent)", opacity: leaf.done ? 0.7 : 1 }}>
            {tag}
          </span>
        ) : null}
      </span>
    </li>
  );
}
