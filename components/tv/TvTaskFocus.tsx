"use client";

import { motion } from "motion/react";

import { pluralRu } from "@/lib/tasks/status-text";
import { storyCard, taskSteps, type FocusTone, type StoryRow } from "@/lib/tv/focus";
import type { TvTaskFocus as TvTaskFocusData } from "@/lib/tv/queries";
import { FOCUS_MS } from "@/lib/tv/state";

import { TvAvatar } from "./TvAvatar";
import { Deadline, TvSteps } from "./TvTaskCard";
import s from "./tv.module.css";

/**
 * Одно дело во весь экран (D-123): директор нажал «На экран» на экране задачи — на стене
 * исполнитель, дело крупно, четыре станции «Выдана → В работе → Сдача → Закрыта» словами
 * телефона сотрудника (D-173, D-182) и вся хронология. Нужен, когда разбирают одно дело вдвоём.
 * Журнал событий на стене есть только здесь.
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

/** Строк хронологии на весь экран: две колонки по шесть. */
const ROWS = 12;
/** Одна колонка держит столько строк; больше — две колонки. */
const PER_COLUMN = 6;

const EASE = [0.2, 0, 0, 1] as const;

export function TvTaskFocus({ focus, remainingMs, now }: { focus: TvTaskFocusData; remainingMs: number; now: Date }) {
  const card = storyCard(focus.task, now, ROWS);
  const steps = taskSteps(focus.task, now);
  const color = TONE[card.tone];
  const counts = focus.task.counts;
  const minutes = Math.ceil(remainingMs / 60_000);
  const person = focus.employee;
  const body = focus.task.body?.trim() || null;
  const columns = card.rows.length > PER_COLUMN ? 2 : 1;
  // zeros stay off the wall: «0 голосовых» says nothing
  const said: [number, [string, string, string]][] = counts
    ? (
        [
          [counts.photos, ["фото", "фото", "фото"]],
          [counts.voices, ["голосовое", "голосовых", "голосовых"]],
          [counts.texts, ["сообщение", "сообщения", "сообщений"]],
          [counts.questions, ["уточнение", "уточнения", "уточнений"]],
        ] satisfies [number, [string, string, string]][]
      ).filter(([value]) => value > 0)
    : [];

  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2vh]" data-testid="tv-task" data-stage={card.stage}>
      <div className="grid min-h-0 flex-1 gap-[4vh]" style={{ gridTemplateColumns: "40vh minmax(0,1fr)" }}>
        {/* who does it, by when, how much was said */}
        <motion.aside
          initial={{ opacity: 0, y: "1.6vh" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex min-h-0 flex-col gap-[2.6vh] overflow-hidden p-[0.6vh]"
        >
          {person ? (
            <div className="flex flex-col gap-[1.6vh]">
              <TvAvatar name={person.name} src={person.avatar_url} size={12} />
              <div className="min-w-0">
                <p className="tv-lead line-clamp-2 font-bold tracking-[-0.02em]">{person.name}</p>
                {person.position ? <p className="tv-caption mt-[0.4vh] line-clamp-1 text-muted">{person.position}</p> : null}
              </div>
            </div>
          ) : null}

          {card.deadline ? (
            <div>
              <Deadline text={card.deadline} soon={card.soon} />
            </div>
          ) : null}

          {said.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-[2vh] gap-y-[1.8vh]" data-testid="tv-task-counts">
              {said.map(([value, words]) => (
                <div key={words[0]} className="min-w-0">
                  <p className="tv-title nums font-bold tabular-nums">{value}</p>
                  <p className="tv-caption truncate text-muted">{pluralRu(value, words)}</p>
                </div>
              ))}
            </div>
          ) : null}
        </motion.aside>

        {/* the order itself: the title big, what was said, the four stations, then everything */}
        <section className="flex min-h-0 flex-col gap-[3vh]">
          <motion.div
            initial={{ opacity: 0, y: "1.6vh" }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.08, ease: EASE }}
            className="min-w-0"
          >
            <h2 className="tv-title line-clamp-2 font-bold tracking-[-0.025em] [overflow-wrap:anywhere]">{card.title}</h2>
            {body ? <p className="tv-text mt-[1vh] line-clamp-2 text-muted [overflow-wrap:anywhere]">{body}</p> : null}
          </motion.div>

          <motion.div initial={{ opacity: 0, y: "1vh" }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.15, ease: EASE }}>
            <TvSteps steps={steps} size="full" />
          </motion.div>

          <motion.ol
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.3, ease: EASE }}
            className="min-h-0 gap-x-[4vh] overflow-hidden rounded-[2vh] px-[3vh] py-[2vh]"
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
          <span className="tv-caption shrink-0 text-muted">на экране ещё {minutes} мин</span>
        </div>
      ) : null}
    </div>
  );
}

function StoryLine({ row, color }: { row: StoryRow; color: string }) {
  const now = row.tone === "now";
  const more = row.key === "more";
  return (
    <li className="tv-text grid break-inside-avoid items-center gap-x-[1.4vh] py-[0.4vh]" style={{ gridTemplateColumns: "1.2vh 4.3em minmax(0,1fr)" }}>
      <span
        aria-hidden
        className="h-[1.2vh] w-[1.2vh] rounded-full"
        style={{ background: now ? color : row.tone === "done" ? "var(--ok)" : "var(--text-muted)", opacity: more ? 0.4 : 1 }}
      />
      <span className="nums truncate tabular-nums" style={{ color: now ? color : "var(--text-muted)", fontWeight: now ? 600 : 400 }}>
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
