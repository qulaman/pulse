"use client";

import { motion } from "framer-motion";

import { pluralRu } from "@/lib/tasks/status-text";
import { storyCard, taskSteps, type FocusTone, type StoryRow, type TaskStep } from "@/lib/tv/focus";
import type { TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";
import { FOCUS_MS } from "@/lib/tv/state";

import { TvAvatar } from "./TvAvatar";
import s from "./tv.module.css";

/**
 * Одно дело во весь экран (D-123): директор нажал «На экран» на экране задачи — на стене
 * исполнитель, дело крупно, четыре шага «Поставлена → Принята в работу → Сдана → Принята
 * директором» и вся хронология. Нужен, когда разбирают одно дело вдвоём.
 *
 * Как и вся стена: ни слова переписки (только вид и время), ни отказа, ни «просрочено»;
 * отказанное или отозванное дело база не отдаёт, стена возвращается в эфир (D-45). Гостю —
 * без названия и без слов директора (D-33). Правила — `lib/tv/focus.ts`.
 */

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

/** Строк хронологии на весь экран: две колонки по восемь. */
const ROWS = 16;

const EASE = [0.2, 0, 0, 1] as const;

export function TvTaskFocus({ focus, remainingMs, now }: { focus: TvTaskFocusData; remainingMs: number; now: Date }) {
  const card = storyCard(focus.task, now, ROWS);
  const steps = taskSteps(focus.task, now);
  const color = TONE[card.tone];
  const counts = focus.task.counts;
  const minutes = Math.ceil(remainingMs / 60_000);
  const person = focus.employee;
  const body = focus.task.body?.trim() || null;
  const columns = card.rows.length > 8 ? 2 : 1;

  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2vh]" data-testid="tv-task" data-stage={card.stage}>
      <div className="grid min-h-0 flex-1 gap-[4vh]" style={{ gridTemplateColumns: "44vh minmax(0,1fr)" }}>
        {/* who does it, where it stands, how much was said */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex min-h-0 flex-col gap-[2.6vh] overflow-hidden p-[0.6vh]"
        >
          {person ? (
            <div className="flex flex-col gap-[1.6vh]">
              <TvAvatar name={person.name} src={person.avatar_url} size={12} />
              <div className="min-w-0">
                <p className="line-clamp-2 text-[4.6vh] font-bold leading-[5.2vh] tracking-[-0.02em]">{person.name}</p>
                {person.position ? <p className="mt-[0.4vh] line-clamp-1 text-[2.6vh] leading-[3.2vh] text-muted">{person.position}</p> : null}
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-[1.4vh]">
            <span className="flex items-center gap-[1vh] text-[3vh] font-semibold leading-[3.8vh]" style={{ color }}>
              <span aria-hidden className="h-[1.4vh] w-[1.4vh] rounded-full" style={{ background: color }} />
              {card.stageLabel}
            </span>
            {card.deadline ? (
              <span
                className="rounded-full px-[1.6vh] py-[0.4vh] text-[2.6vh] leading-[3.4vh] tabular-nums"
                style={{
                  color: card.soon ? "var(--accent)" : "var(--text-muted)",
                  fontWeight: card.soon ? 600 : 400,
                  background: card.soon ? "color-mix(in srgb, var(--accent) 14%, transparent)" : "var(--surface-2)",
                }}
              >
                {card.deadline}
              </span>
            ) : null}
          </div>

          {counts ? (
            <div className="grid grid-cols-2 gap-x-[2vh] gap-y-[1.8vh]" data-testid="tv-task-counts">
              <Count value={counts.photos} words={["фото", "фото", "фото"]} />
              <Count value={counts.voices} words={["голосовое", "голосовых", "голосовых"]} />
              <Count value={counts.texts} words={["сообщение", "сообщения", "сообщений"]} />
              <Count value={counts.questions} words={["уточнение", "уточнения", "уточнений"]} />
            </div>
          ) : null}
        </motion.aside>

        {/* the order itself: the title big, what was said, the four steps, then everything */}
        <section className="flex min-h-0 flex-col gap-[2.6vh]">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            className="min-w-0"
          >
            <h2 className="line-clamp-2 text-[5.6vh] font-bold leading-[6.4vh] tracking-[-0.025em] [overflow-wrap:anywhere]">{card.title}</h2>
            {body ? <p className="mt-[1vh] line-clamp-2 text-[2.8vh] leading-[3.6vh] text-muted [overflow-wrap:anywhere]">{body}</p> : null}
          </motion.div>

          <Steps steps={steps} />

          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            className="min-h-0 gap-x-[5vh] overflow-hidden rounded-[2vh] px-[3vh] py-[2vh]"
            style={{ columnCount: columns, background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
            data-testid="tv-task-story"
          >
            {card.rows.map((row) => (
              <StoryLine key={row.key} row={row} color={color} />
            ))}
          </motion.ol>
        </section>
      </div>

      {/* how long the order stays on the wall: the bar melts, the words say it */}
      {minutes > 0 ? (
        <div className="flex shrink-0 items-center gap-[2vh]">
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

/** A number and its word; zero stays quiet. */
function Count({ value, words }: { value: number; words: [string, string, string] }) {
  return (
    <div className="min-w-0">
      <p className="text-[5vh] font-bold leading-[5.4vh] tabular-nums" style={{ color: value > 0 ? "var(--text)" : "var(--text-muted)", opacity: value > 0 ? 1 : 0.55 }}>
        {value}
      </p>
      <p className="truncate text-[2.2vh] leading-[2.8vh] text-muted">{pluralRu(value, words)}</p>
    </div>
  );
}

/**
 * The four steps across: passed ones filled green (progress is good news), the current one
 * ringed in the accent and breathing, the rest hollow — whatever colour the stage wears.
 */
function Steps({ steps }: { steps: TaskStep[] }) {
  return (
    <ol className="grid grid-cols-4" data-testid="tv-task-steps">
      {steps.map((step, index) => {
        const passed = step.state === "passed";
        const now = step.state === "now";
        const color = passed ? "var(--ok)" : "var(--accent)";
        return (
          <motion.li
            key={step.key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: 0.15 + index * 0.07, ease: EASE }}
            className="relative flex min-w-0 flex-col gap-[1.2vh]"
            data-state={step.state}
          >
            <div className="relative flex h-[3.6vh] items-center">
              {/* the line to the next step: lit when this one is passed */}
              {index < steps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-[3.6vh] right-0 h-[0.5vh] rounded-full"
                  style={{ background: passed && steps[index + 1].state !== "next" ? "var(--ok)" : "var(--border)", opacity: passed ? 1 : 0.8 }}
                />
              ) : null}
              <span aria-hidden className="relative flex h-[3.6vh] w-[3.6vh] items-center justify-center">
                {now ? (
                  <span className={`absolute inset-[-0.8vh] rounded-full ${s.live}`} style={{ background: `color-mix(in srgb, ${color} 28%, transparent)` }} />
                ) : null}
                <span
                  className="relative flex h-[3.6vh] w-[3.6vh] items-center justify-center rounded-full"
                  style={{
                    background: passed ? color : "var(--surface)",
                    boxShadow: `inset 0 0 0 0.45vh ${passed || now ? color : "var(--border)"}`,
                  }}
                >
                  {passed ? <Check /> : null}
                </span>
              </span>
            </div>
            <div className="min-w-0 pr-[2vh]">
              <p
                className="text-[2.6vh] leading-[3.2vh]"
                style={{ color: passed || now ? "var(--text)" : "var(--text-muted)", fontWeight: now ? 700 : passed ? 600 : 400 }}
              >
                {step.label}
              </p>
              <p className="h-[3vh] text-[2.3vh] leading-[3vh] tabular-nums" style={{ color: now ? color : "var(--text-muted)" }}>
                {step.time ?? (now ? "ждём" : "")}
              </p>
            </div>
          </motion.li>
        );
      })}
    </ol>
  );
}

function StoryLine({ row, color }: { row: StoryRow; color: string }) {
  const now = row.tone === "now";
  const more = row.key === "more";
  return (
    <li className="grid break-inside-avoid items-center gap-x-[1.6vh] py-[0.5vh] text-[2.6vh] leading-[3.4vh]" style={{ gridTemplateColumns: "1.4vh 12vh minmax(0,1fr)" }}>
      <span
        aria-hidden
        className="h-[1.2vh] w-[1.2vh] rounded-full"
        style={{ background: now ? color : row.tone === "done" ? "var(--ok)" : "var(--text-muted)", opacity: more ? 0.4 : 1 }}
      />
      <span className="truncate tabular-nums" style={{ color: now ? color : "var(--text-muted)", fontWeight: now ? 600 : 400 }}>
        {row.time}
      </span>
      <span
        className="truncate"
        style={{
          color: more ? "var(--text-muted)" : row.tone === "done" ? "var(--ok)" : "var(--text)",
          fontWeight: now ? 600 : 400,
        }}
      >
        {row.text}
      </span>
    </li>
  );
}

function Check() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[2.2vh] w-[2.2vh]" fill="none" stroke="var(--bg)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
