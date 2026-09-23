"use client";

import { motion } from "framer-motion";

import { pluralRu } from "@/lib/tasks/status-text";
import { focusCard, initialsOfName, type FocusLane, type FocusTone } from "@/lib/tv/focus";
import type { TvFocusEmployee } from "@/lib/tv/queries";
import { FOCUS_MS } from "@/lib/tv/state";

import s from "./tv.module.css";

/**
 * Сотрудник на стене (D-76 §10, редизайн D-96): директор нажал в телефоне — на стене его
 * дела, и с двух метров за секунду понятно, сколько их, где основной вес и что уже сделано.
 *
 * Композиция: человек (фото или инициалы, имя, должность) и «сегодня сдано» справа; под
 * ним три колонки по стадиям — «Новые → В работе → На проверке» — с крупным числом над
 * каждой и карточками дел внутри; внизу тающая полоска времени на стене.
 *
 * Чего здесь нет и не будет: слова «просрочено», красного цвета, отказов и доработок
 * отдельным словом. Негатив по именам на экран в кабинете не выносится (D-45) — срок
 * печатается датой, «сегодня» подсвечено акцентом, только пока он впереди. Правила
 * живут в lib/tv/focus.ts, здесь только раскладка.
 */

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

const EASE = [0.2, 0, 0, 1] as const;

export function TvFocus({ focus, remainingMs, now }: { focus: TvFocusEmployee; remainingMs: number; now: Date }) {
  const card = focusCard(focus, now);
  const minutes = Math.ceil(remainingMs / 60_000);
  const { name, position } = focus.employee;
  const avatar = focus.employee.avatar_url ?? null;

  return (
    <div className="flex w-full max-w-[92vw] flex-col gap-[3vh]" data-testid="tv-focus">
      {/* the person */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex items-center gap-[3.4vh]"
      >
        <span
          className="flex h-[13vh] w-[13vh] shrink-0 items-center justify-center overflow-hidden rounded-full text-[5.4vh] font-bold leading-none"
          style={{
            background: "color-mix(in srgb, var(--accent-2) 30%, var(--surface-2))",
            boxShadow: "0 0 0 0.5vh color-mix(in srgb, var(--accent-2) 55%, transparent)",
          }}
        >
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
            <img src={avatar} alt="" className="h-full w-full object-cover" />
          ) : (
            initialsOfName(name)
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[6.8vh] font-bold leading-[7.8vh] tracking-[-0.02em]">{name}</p>
          {position ? <p className="truncate text-[3.2vh] leading-[4.2vh] text-muted">{position}</p> : null}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-[1vh]">
          {card.done.count > 0 ? (
            <p className="flex items-center gap-[1.2vh] text-[3.4vh] font-semibold leading-[4.4vh]" style={{ color: "var(--ok)" }}>
              <CheckIcon />
              Сегодня сдано: {card.done.count}
            </p>
          ) : null}
          {typeof focus.points_week === "number" && focus.points_week > 0 ? (
            <p className="text-[2.8vh] font-semibold leading-[3.6vh]" style={{ color: "var(--gold)" }}>
              {focus.points_week} {pluralRu(focus.points_week, ["очко", "очка", "очков"])} за неделю
            </p>
          ) : null}
        </div>
      </motion.div>

      {card.total === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
          className="flex flex-col gap-[1.4vh] py-[4vh]"
        >
          <p className="text-[5vh] font-semibold leading-[6.4vh]">Открытых дел нет</p>
          {card.done.titles.map((title, i) => (
            <p key={i} className="flex items-center gap-[1.4vh] text-[3.2vh] leading-[4.2vh] text-muted">
              <span style={{ color: "var(--ok)" }}>
                <CheckIcon />
              </span>
              {title}
            </p>
          ))}
        </motion.div>
      ) : (
        <div className="grid grid-cols-3 gap-[3vh]">
          {card.lanes.map((lane, index) => (
            <Lane key={lane.key} lane={lane} index={index} last={index === card.lanes.length - 1} />
          ))}
        </div>
      )}

      {/* how long the person stays on the wall: the bar melts, the words say it */}
      {minutes > 0 ? (
        <div className="flex items-center gap-[2vh]">
          <div className="h-[0.5vh] flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
            <div
              className={`h-full w-full rounded-full ${s.gauge}`}
              style={{ background: "var(--accent-2)", transform: `scaleX(${Math.min(1, remainingMs / FOCUS_MS)})` }}
            />
          </div>
          <span className="shrink-0 text-[2.2vh] leading-[2.8vh] text-muted">на экране ещё {minutes} мин</span>
        </div>
      ) : null}
    </div>
  );
}

function Lane({ lane, index, last }: { lane: FocusLane; index: number; last: boolean }) {
  const color = TONE[lane.tone];
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.12 + index * 0.08, ease: EASE }}
      className="relative flex min-w-0 flex-col gap-[1.4vh]"
      data-lane={lane.key}
    >
      {/* the stage: a big number and its word; the chevron says where work goes next */}
      <header className="flex items-baseline gap-[1.6vh] pb-[0.6vh]">
        <span className="text-[8vh] font-bold leading-[8vh] tabular-nums" style={{ color: lane.count > 0 ? color : "var(--text-muted)" }}>
          {lane.count}
        </span>
        <span className="text-[3vh] font-semibold leading-[3.8vh]" style={{ color: lane.count > 0 ? "var(--text)" : "var(--text-muted)" }}>
          {lane.label}
        </span>
        {!last ? (
          <span aria-hidden className="ml-auto text-[4vh] leading-none text-muted opacity-60">
            ›
          </span>
        ) : null}
      </header>

      {lane.rows.length === 0 ? (
        <p
          className="rounded-[1.6vh] px-[2vh] py-[1.8vh] text-[2.6vh] leading-[3.4vh] text-muted opacity-60"
          style={{ background: "color-mix(in srgb, var(--surface) 45%, transparent)" }}
        >
          —
        </p>
      ) : (
        <ul className="flex flex-col gap-[1.2vh]">
          {lane.rows.map((row, i) => (
            <motion.li
              key={row.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.24 + index * 0.08 + i * 0.05, ease: EASE }}
              className="relative overflow-hidden rounded-[1.6vh] py-[1.5vh] pl-[2.4vh] pr-[2vh]"
              style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
            >
              <span aria-hidden className="absolute inset-y-[1.2vh] left-0 w-[0.6vh] rounded-r-full" style={{ background: color }} />
              <p className="line-clamp-2 text-[3.1vh] font-medium leading-[4vh] [overflow-wrap:anywhere]">{row.title}</p>
              {row.deadline ? (
                <p
                  className="mt-[0.4vh] text-[2.3vh] leading-[3vh]"
                  style={{ color: row.soon ? "var(--accent)" : "var(--text-muted)", fontWeight: row.soon ? 600 : 400 }}
                >
                  {row.deadline}
                </p>
              ) : null}
            </motion.li>
          ))}
          {lane.more > 0 ? <li className="px-[1vh] text-[2.4vh] leading-[3vh] text-muted">+ ещё {lane.more}</li> : null}
        </ul>
      )}
    </motion.section>
  );
}

function CheckIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="h-[1em] w-[1em]"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
