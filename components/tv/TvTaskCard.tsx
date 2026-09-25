"use client";

import { motion } from "framer-motion";

import type { FocusTone, StoryCard, StoryRow } from "@/lib/tv/focus";

import s from "./tv.module.css";

/**
 * Одно дело на стене (D-120): стадия и срок, заголовок, под ним — хронология от «Поставлена»
 * до того, где дело сейчас. Слова — о деле, не о человеке; ни одного слова переписки —
 * только вид события и время (D-33, D-45). Правила строк — `lib/tv/focus.ts`.
 *
 * Два размера: в сетке 2 × 2 и в одной строке до двух дел — там карточка выше, строки
 * хронологии крупнее и их больше.
 */

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

const EASE = [0.2, 0, 0, 1] as const;

export function TvTaskCard({ card, index, large }: { card: StoryCard; index: number; large: boolean }) {
  const color = TONE[card.tone];
  return (
    <motion.article
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 + index * 0.06, ease: EASE }}
      className="relative flex min-h-0 flex-col overflow-hidden rounded-[2vh] py-[1.8vh] pl-[2.8vh] pr-[2.4vh]"
      style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
      data-stage={card.stage}
    >
      <span aria-hidden className="absolute inset-y-[1.6vh] left-0 w-[0.6vh] rounded-r-full" style={{ background: color }} />

      {/* stage and deadline: what it is and by when, before what happened */}
      <header className="flex items-center justify-between gap-[1.6vh]">
        <span className="flex items-center gap-[1vh] text-[2.2vh] font-semibold leading-[2.8vh]" style={{ color }}>
          <span aria-hidden className="h-[1.1vh] w-[1.1vh] rounded-full" style={{ background: color }} />
          {card.stageLabel}
        </span>
        {card.deadline ? (
          <span
            className="shrink-0 rounded-full px-[1.4vh] py-[0.3vh] text-[2.1vh] leading-[2.8vh] tabular-nums"
            style={{
              color: card.soon ? "var(--accent)" : "var(--text-muted)",
              fontWeight: card.soon ? 600 : 400,
              background: card.soon ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--surface-2)",
            }}
          >
            {card.deadline}
          </span>
        ) : null}
      </header>

      <h3
        className={`mt-[1vh] line-clamp-2 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere] ${
          large ? "text-[3.6vh] leading-[4.4vh]" : "text-[2.9vh] leading-[3.6vh]"
        }`}
      >
        {card.title}
      </h3>

      <ol className={`relative flex min-h-0 flex-col ${large ? "mt-[2.2vh]" : "mt-[1.4vh]"}`}>
        {/* the rail the dots sit on; it stops at the last row */}
        {card.rows.length > 1 ? (
          <span
            aria-hidden
            className="absolute left-[0.65vh] w-[0.2vh] rounded-full"
            style={{
              top: large ? "1.8vh" : "1.5vh",
              bottom: large ? "1.8vh" : "1.5vh",
              background: "var(--border)",
            }}
          />
        ) : null}
        {card.rows.map((row) => (
          <Row key={row.key} row={row} color={color} large={large} />
        ))}
      </ol>
    </motion.article>
  );
}

function Row({ row, color, large }: { row: StoryRow; color: string; large: boolean }) {
  const more = row.key === "more";
  const now = row.tone === "now";
  const dot = now ? color : row.tone === "done" ? "var(--ok)" : "var(--text-muted)";
  return (
    <li
      className={`relative grid items-center gap-x-[1.4vh] ${large ? "min-h-[3.6vh] text-[2.6vh]" : "min-h-[3vh] text-[2.3vh]"}`}
      style={{ gridTemplateColumns: large ? "1.5vh 12.6vh minmax(0,1fr)" : "1.5vh 11vh minmax(0,1fr)" }}
    >
      {more ? (
        <span aria-hidden className="flex flex-col items-center gap-[0.3vh] opacity-60">
          <i className="h-[0.35vh] w-[0.35vh] rounded-full bg-[var(--text-muted)]" />
          <i className="h-[0.35vh] w-[0.35vh] rounded-full bg-[var(--text-muted)]" />
          <i className="h-[0.35vh] w-[0.35vh] rounded-full bg-[var(--text-muted)]" />
        </span>
      ) : (
        <span aria-hidden className="relative flex h-[1.5vh] w-[1.5vh] items-center justify-center">
          {now ? (
            <span className={`absolute inset-[-0.5vh] rounded-full ${s.live}`} style={{ background: `color-mix(in srgb, ${color} 30%, transparent)` }} />
          ) : null}
          <span
            className="relative rounded-full"
            style={{
              width: now ? "1.5vh" : "1.1vh",
              height: now ? "1.5vh" : "1.1vh",
              background: dot,
              // a surface ring keeps the dot off the rail line
              boxShadow: "0 0 0 0.35vh var(--surface)",
            }}
          />
        </span>
      )}
      <span
        className="truncate tabular-nums leading-[1.3]"
        style={{ color: now ? color : "var(--text-muted)", fontWeight: now ? 600 : 400 }}
      >
        {row.time}
      </span>
      <span
        className="truncate leading-[1.3]"
        style={{
          color: more ? "var(--text-muted)" : now ? "var(--text)" : row.tone === "done" ? "var(--ok)" : "var(--text)",
          fontWeight: now ? 600 : 400,
          opacity: more ? 0.8 : 1,
        }}
      >
        {row.text}
      </span>
    </li>
  );
}
