"use client";

import { motion } from "motion/react";

import type { FocusPlate, TaskStep } from "@/lib/tv/focus";

import s from "./tv.module.css";

/**
 * Одно дело человека на стене (D-120, v5 — D-182): заголовок, срок и четыре станции дела — та же
 * полоса, что в сцене одного дела, без журнала событий (журнал живёт только там). Слова станций —
 * как на телефоне сотрудника (D-173). Ни отказа, ни «просрочено» (D-45). Правила — `lib/tv/focus.ts`.
 *
 * Два вида: `large` — до двух дел, карточки одна под другой, у станций подписи; в сетке 2 × 2 —
 * полоса без подписей и слово горящей станции рядом с ней.
 */

const EASE = [0.2, 0, 0, 1] as const;

export function TvTaskCard({ plate, index, large }: { plate: FocusPlate; index: number; large: boolean }) {
  return (
    <motion.article
      initial={{ opacity: 0, y: "1.6vh" }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.1 + index * 0.06, ease: EASE }}
      className={`flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[2vh] ${large ? "gap-[2.4vh] px-[3vh] py-[2.6vh]" : "gap-[1.8vh] px-[2.6vh] py-[2.2vh]"}`}
      style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
      data-testid="tv-plate"
    >
      <header className="flex min-w-0 items-start justify-between gap-[2vh]">
        <h3 className={`${large ? "tv-title" : "tv-lead"} line-clamp-2 min-w-0 font-semibold tracking-[-0.01em] [overflow-wrap:anywhere]`}>
          {plate.title}
        </h3>
        {plate.deadline ? <Deadline text={plate.deadline} soon={plate.soon} /> : null}
      </header>

      {large ? (
        <TvSteps steps={plate.steps} size="card" />
      ) : (
        <div className="flex min-w-0 items-center gap-[2.4vh]">
          <div className="w-[46%] shrink-0">
            <TvSteps steps={plate.steps} size="bar" />
          </div>
          {plate.now ? (
            <span className="tv-caption truncate font-semibold" style={{ color: "var(--accent)" }}>
              {plate.now}
            </span>
          ) : null}
        </div>
      )}
    </motion.article>
  );
}

/** The deadline chip: today and still ahead — in the accent; any other date — quietly (D-45). */
export function Deadline({ text, soon }: { text: string; soon: boolean }) {
  return (
    <span
      className="tv-caption nums shrink-0 rounded-full px-[1.4vh] tabular-nums"
      style={{
        color: soon ? "var(--accent)" : "var(--text-muted)",
        fontWeight: soon ? 600 : 400,
        background: soon ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--surface-2)",
      }}
    >
      {text}
    </span>
  );
}

/**
 * The four stations across: passed ones filled green (progress is good news), the lit one ringed in
 * the accent, the rest hollow. `full` — the order on the whole wall: a label and a time under each;
 * `card` — a person's order: labels only; `bar` — the bare bar of a small card, its word stands beside it.
 * The lit ring breathes with opacity only (D-45).
 */
export function TvSteps({ steps, size }: { steps: TaskStep[]; size: "full" | "card" | "bar" }) {
  const dot = size === "full" ? 3.6 : size === "card" ? 3 : 2.4;
  const line = size === "bar" ? 0.4 : 0.5;
  return (
    <ol className="grid grid-cols-4" data-testid="tv-steps" data-size={size}>
      {steps.map((step, index) => {
        const passed = step.state === "passed";
        const lit = step.state === "now";
        const color = passed ? "var(--ok)" : "var(--accent)";
        const nextLit = index < steps.length - 1 && steps[index + 1].state !== "next";
        return (
          <li key={step.key} className="relative flex min-w-0 flex-col gap-[1.2vh]" data-state={step.state}>
            <div className="relative flex items-center" style={{ height: `${dot}vh` }}>
              {/* the line to the next station: green once both ends are reached */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute right-0 rounded-full"
                  style={{ left: `${dot}vh`, height: `${line}vh`, background: passed && nextLit ? "var(--ok)" : "var(--border)" }}
                />
              ) : null}
              <span aria-hidden className="relative flex items-center justify-center" style={{ width: `${dot}vh`, height: `${dot}vh` }}>
                {lit ? (
                  <span className={`absolute inset-[-0.7vh] rounded-full ${s.live}`} style={{ background: `color-mix(in srgb, ${color} 28%, transparent)` }} />
                ) : null}
                <span
                  className="relative flex h-full w-full items-center justify-center rounded-full"
                  style={{
                    background: passed ? color : "var(--surface)",
                    boxShadow: `inset 0 0 0 ${dot * 0.13}vh ${passed || lit ? color : "var(--border)"}`,
                  }}
                >
                  {passed ? <Check size={dot * 0.6} /> : null}
                </span>
              </span>
            </div>
            {size !== "bar" ? (
              <div className="min-w-0 pr-[1.6vh]">
                <p
                  className={size === "full" ? "tv-text" : "tv-caption"}
                  style={{ color: passed || lit ? "var(--text)" : "var(--text-muted)", fontWeight: lit ? 700 : passed ? 600 : 400 }}
                >
                  {step.label}
                </p>
                {size === "full" ? (
                  // the row keeps its height on a station still ahead: the four labels stay on one line
                  <p className="tv-caption nums tabular-nums text-muted">{step.time ?? " "}</p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Check({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden style={{ width: `${size}vh`, height: `${size}vh` }} fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
