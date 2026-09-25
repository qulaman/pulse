"use client";

import { AnimatePresence, motion } from "framer-motion";
import { memo } from "react";

import type { MapBranch, MapLayout, MapLeaf } from "@/lib/tv/boardMap";

import { Badge, clampStyle, DIM, DONE_TEXT, EASE, FreshGlow, LitPlate, vh } from "./TvBoardParts";

/**
 * «Карта» доски на стене (D-121): название — узел в центре, пункты — ветви справа и слева
 * на плавных лентах, подпункты — листья у своей ветви. Где что стоит, считает `mapLayout`
 * (всё в vh внутри поля); здесь узлы стоят на своих местах через transform, а связи —
 * один слой SVG под ними. Новая ветвь вырастает (opacity + scale), соседи переезжают
 * transform'ом; слой связей при перестройке сменяется прозрачностью. Ведущий подсветил
 * ветвь — она на подложке и чуть крупнее, остальные с их связями и листьями гаснут.
 */

/**
 * Оттенки ветвей — акцент и его приглушённые тона, по кругу (DESIGN §2: один акцент, не
 * радуга). Отмеченная ветвь — нейтральная.
 */
const TONES = [
  "var(--accent)",
  "color-mix(in srgb, var(--accent) 62%, var(--text))",
  "var(--accent-2)",
  "color-mix(in srgb, var(--accent) 55%, var(--text-muted))",
] as const;

const toneOf = (branch: MapBranch) => (branch.item.done ? "var(--text-muted)" : TONES[branch.tone]);

export const TvBoardMap = memo(function TvBoardMap({
  layout,
  title,
  focus,
  fresh,
  still,
}: {
  layout: MapLayout;
  title: string;
  focus: string | null;
  fresh: string;
  still: boolean;
}) {
  const freshIds = new Set(fresh ? fresh.split(",") : []);
  // the links are redrawn only when the geometry changes: then the old layer fades out under the new one
  const geometry = layout.branches.map((branch) => branch.path + branch.leaves.map((leaf) => leaf.path).join("")).join("|");
  const glide = { duration: still ? 0 : 0.6, ease: EASE };
  const { center } = layout;

  return (
    <div className="relative mx-auto" style={{ width: vh(layout.width), height: vh(layout.height) }} data-testid="tv-board-map" data-tier={layout.tier.key}>
      <AnimatePresence initial={false}>
        <motion.svg
          key={geometry}
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: still ? 0 : 0.5, ease: EASE }}
        >
          {layout.branches.map((branch) => {
            const tone = toneOf(branch);
            const dim = focus !== null && focus !== branch.item.id;
            return (
              <g key={branch.item.id} style={{ opacity: dim ? DIM * 0.8 : branch.item.done ? 0.55 : 1, transition: "opacity 500ms var(--ease-in-out)" }}>
                <path d={branch.path} style={{ fill: tone, fillOpacity: 0.78 }} />
                {branch.leaves.map((leaf, index) => (
                  <g key={index}>
                    {/* opaque, not translucent: the stems of one branch share their spine and must not stack up brighter */}
                    <path d={leaf.path} style={{ fill: "none", stroke: `color-mix(in srgb, ${tone} 55%, var(--bg))`, strokeWidth: layout.tier.stem, strokeLinecap: "round", strokeLinejoin: "round" }} />
                    <circle
                      cx={leaf.dotX}
                      cy={leaf.dotY}
                      r={layout.tier.dot}
                      style={leaf.leaf ? { fill: leaf.leaf.done ? "var(--ok)" : tone } : { fill: "var(--bg)", stroke: tone, strokeWidth: layout.tier.stem * 0.8 }}
                    />
                  </g>
                ))}
              </g>
            );
          })}
        </motion.svg>
      </AnimatePresence>

      {/* the title in the middle */}
      <motion.div
        className="absolute left-0 top-0 flex items-center justify-center text-center"
        style={{
          width: vh(center.rect.w),
          height: vh(center.rect.h),
          padding: `0 ${vh(center.padX)}`,
          borderRadius: vh(layout.tier.centerRadius),
          background:
            "radial-gradient(120% 140% at 0% 0%, color-mix(in srgb, var(--accent) 20%, transparent), transparent 60%), var(--surface-2)",
          boxShadow: "inset 0 0 0 0.22vh color-mix(in srgb, var(--accent) 55%, transparent), 0 2vh 6vh rgba(0, 0, 0, 0.42)",
        }}
        initial={false}
        animate={{ x: vh(center.rect.x), y: vh(center.rect.y) }}
        transition={glide}
      >
        <h2
          className="font-bold tracking-[-0.025em] [overflow-wrap:anywhere] [text-wrap:balance]"
          style={{ fontSize: vh(center.size), lineHeight: vh(center.lh), ...clampStyle(center.lines) }}
          data-testid="tv-board-title"
        >
          {title}
        </h2>
      </motion.div>

      {layout.branches.map((branch) => (
        <Branch
          key={branch.item.id}
          branch={branch}
          layout={layout}
          lit={focus === branch.item.id}
          dim={focus !== null && focus !== branch.item.id}
          fresh={freshIds.has(branch.item.id)}
          still={still}
        />
      ))}
      {layout.branches.flatMap((branch) =>
        branch.leaves.map((leaf, index) => (
          <Leaf
            key={leaf.leaf?.id ?? `${branch.item.id}-more`}
            leaf={leaf}
            branch={branch}
            layout={layout}
            index={index}
            dim={focus !== null && focus !== branch.item.id}
            fresh={leaf.leaf !== null && freshIds.has(leaf.leaf.id)}
            still={still}
          />
        )),
      )}
    </div>
  );
});

function Branch({ branch, layout, lit, dim, fresh, still }: { branch: MapBranch; layout: MapLayout; lit: boolean; dim: boolean; fresh: boolean; still: boolean }) {
  const { tier } = layout;
  const { rect, item } = branch;
  const tone = toneOf(branch);
  const radius = vh(tier.radius);
  const x = vh(rect.x);
  const y = vh(rect.y);
  return (
    <motion.div
      className="absolute left-0 top-0"
      style={{ width: vh(rect.w), height: vh(rect.h) }}
      // a new branch grows out of its link; the others slide to their new places
      initial={{ x, y, opacity: 0, scale: still ? 1 : 0.7 }}
      animate={{ x, y, opacity: dim ? DIM : 1, scale: lit && !still ? 1.04 : 1 }}
      transition={{ duration: still ? 0 : 0.55, ease: EASE }}
      data-point={item.id}
      data-side={branch.side}
      data-lit={lit || undefined}
      data-done={item.done || undefined}
      data-fresh={fresh || undefined}
    >
      <div
        className="relative flex h-full items-center"
        style={{
          padding: `0 ${vh(tier.padX)}`,
          gap: vh(tier.gap),
          borderRadius: radius,
          background: `color-mix(in srgb, ${tone} 12%, var(--surface))`,
          boxShadow: `inset 0 0 0 0.18vh color-mix(in srgb, ${tone} 36%, transparent)`,
        }}
      >
        <LitPlate on={lit} radius={radius} still={still} />
        <AnimatePresence>{fresh ? <FreshGlow key="glow" radius={radius} still={still} /> : null}</AnimatePresence>
        <Badge n={branch.n} done={item.done} size={tier.badge} lit={lit} tone={tone} />
        <p
          className="relative min-w-0 flex-1 font-semibold tracking-[-0.015em] [overflow-wrap:anywhere] [text-wrap:pretty]"
          style={{ fontSize: vh(tier.size), lineHeight: vh(tier.lh), ...clampStyle(branch.lines), opacity: item.done ? DONE_TEXT + 0.1 : 1 }}
        >
          {item.text}
          {branch.tag ? (
            <span className="font-semibold" style={{ color: "var(--accent)" }}>
              {" "}
              {branch.tag}
            </span>
          ) : null}
        </p>
      </div>
    </motion.div>
  );
}

function Leaf({
  leaf,
  branch,
  layout,
  index,
  dim,
  fresh,
  still,
}: {
  leaf: MapLeaf;
  branch: MapBranch;
  layout: MapLayout;
  index: number;
  dim: boolean;
  fresh: boolean;
  still: boolean;
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
      initial={{ x, y, opacity: 0, scale: still ? 1 : 0.85 }}
      animate={{ x, y, opacity: dim ? DIM : done ? 0.55 : 1, scale: 1 }}
      transition={{ duration: still ? 0 : 0.55, delay: still ? 0 : 0.05 * index, ease: EASE }}
      data-leaf={leaf.leaf?.id ?? "more"}
    >
      <AnimatePresence>
        {fresh ? <FreshGlow key="glow" radius={vh(1)} still={still} inset={`${vh(-0.3)} ${vh(-0.8)}`} /> : null}
      </AnimatePresence>
      <p
        className={`relative font-medium [overflow-wrap:anywhere] [text-wrap:pretty] ${leaf.leaf ? "" : "text-muted"}`}
        style={{
          fontSize: vh(tier.leaf),
          lineHeight: vh(tier.leafLh),
          ...clampStyle(leaf.lines),
          paddingLeft: right ? inner : 0,
          paddingRight: right ? 0 : inner,
          textAlign: right ? "left" : "right",
          color: leaf.leaf ? "color-mix(in srgb, var(--text) 86%, var(--text-muted))" : undefined,
        }}
      >
        {leaf.leaf ? leaf.leaf.text : `+ ещё ${leaf.more}`}
        {leaf.tag ? (
          <span className="font-semibold" style={{ color: "var(--accent)" }}>
            {" "}
            {leaf.tag}
          </span>
        ) : null}
      </p>
    </motion.div>
  );
}
