"use client";

import { AnimatePresence, motion } from "motion/react";
import { memo, useMemo } from "react";

import { mapText, wallText } from "@/lib/tv/board";
import { MAP_TAG, type MapBranch, type MapLayout, type MapLeaf } from "@/lib/tv/boardMap";

import { Badge, clampStyle, DIM, DONE_TEXT, EASE, FreshGlow, LEAF_INK, LINE_INK, LitPlate, TagPlate, vh } from "./TvBoardParts";

/**
 * The board's «Карта» on the wall (D-121, D-185): the title is a node in the centre, points are branches
 * right and left on smooth ribbons, sub-points are leaves by their branch. No more than six branches
 * (`MAP_BRANCHES_MAX`), no text smaller than `tv-small`, no line thinner than 0.4 vh. Nodes are quiet planes
 * with no frames or shadows, links are neutral: the map has no rainbow of hues, green is only the branch
 * under discussion (`.tv-now`) and the «→ Марат» plates. Where everything stands is computed by `mapLayout`
 * (all in vh inside the field); here the nodes stand in their places via transform, and the links of each
 * branch are their own SVG layer under them, as large as their reach. A new branch grows
 * (opacity + scale), the neighbours move by transform; on a rebuild the links layer is swapped by
 * opacity. The presenter lit a branch — it is on a backing plate and a little larger, the others with their
 * links and leaves dim; whole layers dim (compositor), the SVG is not redrawn on frames.
 */

/** The planes of the map: the title a step lighter than the branches, both flat — no ring, no shadow, no gradient. */
const CENTER_PLANE = "color-mix(in srgb, var(--surface-2) 88%, var(--bg))";
const NODE_PLANE = "color-mix(in srgb, var(--surface) 78%, var(--bg))";
const DONE_DOT = "color-mix(in srgb, var(--text-muted) 40%, var(--bg))";

export const TvBoardMap = memo(function TvBoardMap({
  layout,
  title,
  focus,
  fresh,
}: {
  layout: MapLayout;
  title: string;
  focus: string | null;
  fresh: string;
}) {
  const freshIds = useMemo(() => new Set(fresh ? fresh.split(",") : []), [fresh]);
  const glide = { duration: 0.6, ease: EASE };
  const { center } = layout;

  return (
    <div className="relative mx-auto" style={{ width: vh(layout.width), height: vh(layout.height) }} data-testid="tv-board-map" data-tier={layout.tier.key}>
      {layout.branches.map((branch) => (
        <Links key={branch.item.id} branch={branch} layout={layout} dim={focus !== null && focus !== branch.item.id} />
      ))}

      {/* the title in the middle */}
      <motion.div
        className="absolute left-0 top-0 flex items-center justify-center text-center"
        style={{
          width: vh(center.rect.w),
          height: vh(center.rect.h),
          padding: `0 ${vh(center.padX)}`,
          borderRadius: vh(layout.tier.centerRadius),
          background: CENTER_PLANE,
        }}
        initial={false}
        animate={{ x: vh(center.rect.x), y: vh(center.rect.y) }}
        transition={glide}
      >
        <h2
          className="font-bold tracking-[-0.02em] [text-wrap:balance]"
          style={{ fontSize: vh(center.size), lineHeight: vh(center.lh), ...clampStyle(center.lines, center.lh), color: "var(--tv-text)" }}
          data-testid="tv-board-title"
        >
          {title}
        </h2>
      </motion.div>

      {/* the map comes in as a whole (the view's crossfade); only a branch or a leaf said later grows out of its link */}
      <AnimatePresence initial={false}>
        {layout.branches.map((branch) => (
          <Branch
            key={branch.item.id}
            branch={branch}
            layout={layout}
            lit={focus === branch.item.id}
            dim={focus !== null && focus !== branch.item.id}
            fresh={freshIds.has(branch.item.id)}
          />
        ))}
        {layout.branches.flatMap((branch) =>
          branch.leaves.map((leaf) => (
            <Leaf
              key={leaf.leaf?.id ?? `${branch.item.id}-more`}
              leaf={leaf}
              branch={branch}
              layout={layout}
              dim={focus !== null && focus !== branch.item.id}
              fresh={leaf.leaf !== null && freshIds.has(leaf.leaf.id)}
            />
          )),
        )}
      </AnimatePresence>
    </div>
  );
});

/**
 * Связи одной ветви — лента от названия, стебли, точки листьев — отдельным слоем размером с
 * их охват (`branch.links`, в тех же vh). Ведущий гасит ветвь прозрачностью этого слоя: это
 * анимация композитора, а общий SVG на всю карту перерисовывался бы каждый кадр полсекунды.
 * Геометрия изменилась (новая ветвь, лист) — старый слой тает под новым.
 */
const Links = memo(function Links({ branch, layout, dim }: { branch: MapBranch; layout: MapLayout; dim: boolean }) {
  const { tier } = layout;
  const box = branch.links;
  const geometry = branch.path + branch.leaves.map((leaf) => leaf.path).join("");
  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={geometry}
        aria-hidden
        className="pointer-events-none absolute"
        style={{ left: vh(box.x), top: vh(box.y), width: vh(box.w), height: vh(box.h) }}
        initial={{ opacity: 0 }}
        animate={{ opacity: dim ? DIM * 0.8 : branch.item.done ? 0.55 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
      >
        <svg className="block h-full w-full overflow-visible" viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}>
          <path d={branch.path} style={{ fill: LINE_INK }} />
          {branch.leaves.map((leaf, index) => (
            <g key={index}>
              {/* opaque, not translucent: the stems of one branch share their spine and must not stack up brighter */}
              <path d={leaf.path} style={{ fill: "none", stroke: LINE_INK, strokeWidth: tier.stem, strokeLinecap: "round", strokeLinejoin: "round" }} />
              <circle
                cx={leaf.dotX}
                cy={leaf.dotY}
                r={tier.dot}
                style={leaf.leaf ? { fill: leaf.leaf.done ? DONE_DOT : LINE_INK } : { fill: "var(--bg)", stroke: LINE_INK, strokeWidth: tier.stem }}
              />
            </g>
          ))}
        </svg>
      </motion.div>
    </AnimatePresence>
  );
});

// memo: the spotlight moves from branch to branch and redraws those two, not the whole map
const Branch = memo(function Branch({ branch, layout, lit, dim, fresh }: { branch: MapBranch; layout: MapLayout; lit: boolean; dim: boolean; fresh: boolean }) {
  const { tier } = layout;
  const { rect, item } = branch;
  const radius = vh(tier.radius);
  const x = vh(rect.x);
  const y = vh(rect.y);
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: vh(rect.w), height: vh(rect.h) }}
      // a new branch grows out of its link; the others slide to their new places
      initial={{ x, y, opacity: 0, scale: 0.7 }}
      animate={{ x, y, opacity: dim ? DIM : 1, scale: lit ? 1.04 : 1 }}
      transition={{ duration: 0.55, ease: EASE }}
      data-point={item.id}
      data-side={branch.side}
      data-lit={lit || undefined}
      data-done={item.done || undefined}
      data-fresh={fresh || undefined}
    >
      <div
        className="relative flex h-full items-center"
        style={{ padding: `0 ${vh(tier.padX)}`, gap: vh(tier.gap), borderRadius: radius, background: NODE_PLANE }}
      >
        <LitPlate on={lit} radius={radius} />
        <AnimatePresence>{fresh && !lit ? <FreshGlow key="glow" radius={radius} /> : null}</AnimatePresence>
        <span className="relative">
          <Badge n={branch.n} done={item.done} size={tier.badge} />
        </span>
        <div className="relative min-w-0 flex-1">
          <p
            className="font-semibold tracking-[-0.01em] [text-wrap:pretty]"
            style={{ fontSize: vh(tier.size), lineHeight: vh(tier.lh), ...clampStyle(branch.lines, tier.lh), color: "var(--tv-text)", opacity: item.done ? DONE_TEXT + 0.1 : 1 }}
          >
            {mapText(item)}
          </p>
          {branch.tag ? (
            <div className="flex" style={{ marginTop: vh(tier.tagTop) }}>
              <TagPlate tag={branch.tag} pad={MAP_TAG.pad} done={item.done} />
            </div>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
});

const Leaf = memo(function Leaf({
  leaf,
  branch,
  layout,
  dim,
  fresh,
}: {
  leaf: MapLeaf;
  branch: MapBranch;
  layout: MapLayout;
  dim: boolean;
  fresh: boolean;
}) {
  const { tier } = layout;
  const x = vh(leaf.rect.x);
  const y = vh(leaf.rect.y);
  const inner = vh(tier.dot * 2 + tier.dotGap);
  const right = branch.side === "right";
  const done = leaf.leaf?.done === true || branch.item.done;
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: vh(leaf.rect.w), height: vh(leaf.rect.h), transformOrigin: right ? "left center" : "right center" }}
      initial={{ x, y, opacity: 0, scale: 0.85 }}
      animate={{ x, y, opacity: dim ? DIM : done ? 0.55 : 1, scale: 1 }}
      transition={{ duration: 0.55, ease: EASE }}
      data-leaf={leaf.leaf?.id ?? "more"}
    >
      <AnimatePresence>
        {fresh ? <FreshGlow key="glow" radius={vh(1)} inset={`${vh(-0.3)} ${vh(-0.8)}`} /> : null}
      </AnimatePresence>
      <div className="relative flex flex-col" style={{ paddingLeft: right ? inner : 0, paddingRight: right ? 0 : inner, alignItems: right ? "flex-start" : "flex-end" }}>
        <p
          className={`font-medium [text-wrap:pretty] ${leaf.leaf ? "" : "text-muted"}`}
          style={{
            fontSize: vh(tier.leaf),
            lineHeight: vh(tier.leafLh),
            ...clampStyle(leaf.lines, tier.leafLh),
            textAlign: right ? "left" : "right",
            color: leaf.leaf ? LEAF_INK : undefined,
          }}
        >
          {leaf.leaf ? wallText(leaf.leaf) : `+ ещё ${leaf.more}`}
        </p>
        {leaf.tag ? (
          <div className="flex" style={{ marginTop: vh(tier.tagTop) }}>
            <TagPlate tag={leaf.tag} pad={MAP_TAG.pad} done={done} />
          </div>
        ) : null}
      </div>
    </motion.div>
  );
});
