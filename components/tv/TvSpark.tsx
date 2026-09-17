"use client";

import { motion, useReducedMotion } from "framer-motion";

import type { TvTone } from "@/lib/tv/feed";

/**
 * Прилёт события: короткая россыпь искр по карточке-герою. Золото — очки и награды,
 * зелёное — принятая работа, бирюза — новое поручение.
 *
 * Три железных правила эффектов (docs/FRONTEND.md): эффект не блокирует действие —
 * здесь блокировать нечего, данные уже на экране; полная версия только в ключевой
 * момент — искры играют один раз на самом свежем событии и исчезают вместе с
 * подсветкой; бюджет — двенадцать узлов, только transform и opacity.
 */

const COLOR: Record<TvTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  gold: "var(--gold)",
  muted: "var(--text-muted)",
};

const SPARKS = 12;
const DURATION = 1.1;

export function TvSpark({ tone }: { tone: TvTone }) {
  const reduced = useReducedMotion();
  if (reduced) return null;

  return (
    <span aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: SPARKS }, (_, index) => {
        // веер от левого края карточки, где стоят инициалы: искры летят от человека
        const angle = -50 + (100 / (SPARKS - 1)) * index;
        const distance = 26 + (index % 4) * 9;
        const radians = (angle * Math.PI) / 180;
        return (
          <motion.span
            key={index}
            className="absolute left-[5vh] top-1/2 block h-[0.8vh] w-[0.8vh] rounded-full"
            style={{ background: COLOR[tone] }}
            initial={{ opacity: 0.9, x: 0, y: 0, scale: 1 }}
            animate={{
              opacity: 0,
              x: Math.cos(radians) * distance * 3,
              y: Math.sin(radians) * distance,
              scale: 0.4,
            }}
            transition={{ duration: DURATION, ease: "easeOut", delay: (index % 5) * 0.04 }}
          />
        );
      })}
    </span>
  );
}
