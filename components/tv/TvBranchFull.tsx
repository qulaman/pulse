"use client";

import { AnimatePresence, motion } from "motion/react";

import { tagOf, wallText, zoomedBranch, type TvBoardData, type TvBoardLeaf } from "@/lib/tv/board";
import { TV_TYPE } from "@/lib/tv/boardList";
import { MAP_BRANCHES_MAX } from "@/lib/tv/boardMap";

import { Badge, clampStyle, DONE_TEXT, EASE, LEAF_INK, LINE_INK, TagPlate, vh } from "./TvBoardParts";

/** The leaves of a zoomed branch: one column up to three, two after; past ten cells — «+ ещё N». */
const ONE_COLUMN = 3;
const MAX_CELLS = 10;

type LeafType = { columns: number; lines: number; size: number; lh: number; gap: number; dot: number };

/**
 * Type of the leaves by their count, from the wall's scale only (D-185): few — `tv-body` in two lines, many —
 * `tv-small` in one; the tag a plate of `tv-small` on a line of its own under the words. The worst case (a
 * two-line title with its tag, ten long handed leaves) stays inside the room under the title.
 */
function leafType(cells: number): LeafType {
  const columns = cells > ONE_COLUMN ? 2 : 1;
  const rows = Math.ceil(cells / columns);
  if (rows <= 3) return { columns, lines: 2, ...TV_TYPE.body, gap: 3, dot: 1.4 };
  return { columns, lines: 1, ...TV_TYPE.small, gap: 1.6, dot: 1.1 };
}

/** Room between the tag plate and the words above it, and the plate's sides, vh. */
const TAG_TOP = 0.6;
const TAG_PAD = 1.2;

/**
 * A branch over the whole wall (D-144): on the map the presenter lit a point with sub-points —
 * the point's words on top, its sub-points as large leaves, whom each went to on a plate under it;
 * the next step of the presenter gives the map back. A drawing opens as the drawing (`TvSketchFull`),
 * the list keeps its own light. The same layer sits in the wall's miniature on the phone (WallPreview).
 * A visitor's notice still stands above it. Every word at least `tv-small`, inside the wall's safe
 * frame (D-185). Opacity only (D-45).
 */
export function TvBranchFull({ board }: { board: TvBoardData | null }) {
  // a board of more than six points is a list on the wall: no branch opens over it
  const zoom = board && board.items.length <= MAP_BRANCHES_MAX ? zoomedBranch(board) : null;
  const item = zoom?.item;
  const leaves = item?.children ?? [];
  const fits = leaves.length <= MAX_CELLS;
  // «+ ещё N» takes a cell of its own
  const shown = fits ? leaves : leaves.slice(0, MAX_CELLS - 1);
  const more = leaves.length - shown.length;
  const type = leafType(shown.length + (more > 0 ? 1 : 0));
  const tag = item ? tagOf(item) : null;

  return (
    <AnimatePresence>
      {item && zoom ? (
        <motion.div
          key={item.id}
          className="absolute inset-0 z-[15] flex flex-col bg-bg px-[var(--tv-x)] pb-[var(--tv-y)] pt-[var(--tv-y)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          data-testid="tv-board-branch"
          data-point={item.id}
        >
          <div className="flex shrink-0 items-start gap-[2.4vh]">
            <span className="mt-[0.4vh]">
              <Badge n={zoom.at + 1} done={item.done} size={7.2} />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className="tv-lead [text-wrap:balance]"
                style={{ ...clampStyle(2, TV_TYPE.lead.lh), color: "var(--tv-text)", opacity: item.done ? DONE_TEXT : 1 }}
              >
                {wallText(item)}
              </p>
              {tag ? (
                <div className="flex" style={{ marginTop: vh(TAG_TOP + 0.4) }}>
                  <TagPlate tag={tag} pad={TAG_PAD} done={item.done} />
                </div>
              ) : null}
            </div>
            <span className="tv-small tv-num mt-[1.4vh] shrink-0 font-semibold text-muted">
              {zoom.at + 1} / {board?.items.length ?? 0}
            </span>
          </div>

          <ul
            className="mt-[4vh] grid min-h-0 flex-1 content-center"
            style={{ gridTemplateColumns: `repeat(${type.columns}, minmax(0, 1fr))`, columnGap: vh(7), rowGap: vh(type.gap), paddingLeft: vh(9.6) }}
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
          background: leaf.done ? "color-mix(in srgb, var(--text-muted) 40%, var(--bg))" : LINE_INK,
        }}
      />
      <span className="min-w-0 flex-1">
        <span
          className="block font-medium [text-wrap:pretty]"
          style={{ fontSize: vh(type.size), lineHeight: vh(type.lh), ...clampStyle(type.lines, type.lh), color: LEAF_INK, opacity: leaf.done ? DONE_TEXT + 0.08 : 1 }}
        >
          {wallText(leaf)}
        </span>
        {/* whom and how far, on a line of its own: never cut by the clamp of the words */}
        {tag ? (
          <span className="flex" style={{ marginTop: vh(TAG_TOP) }}>
            <TagPlate tag={tag} pad={TAG_PAD} done={leaf.done} />
          </span>
        ) : null}
      </span>
    </li>
  );
}
