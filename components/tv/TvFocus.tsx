"use client";

import { AnimatePresence, motion } from "motion/react";

import { focusPeople, initialsOfName, ratingView, type FocusTone } from "@/lib/tv/focus";
import type { TvFocusEmployee } from "@/lib/tv/queries";
import { FOCUS_MS } from "@/lib/tv/state";

import { TvRating } from "./TvRating";
import { TvTaskCard } from "./TvTaskCard";
import s from "./tv.module.css";

/**
 * Сотрудник на стене (D-76 §10; D-96; D-120; v5 — D-182): директор нажал в телефоне — на стене
 * человек и его дела.
 *
 * Слева колонка человека — фото или инициалы, имя, должность, числа по стадиям (нулевые не
 * печатаются), рейтинг недели и «сегодня сдано». Справа — дела: заголовок, срок и четыре станции,
 * как в сцене одного дела; журнала событий здесь нет (он — в сцене одного дела). До двух дел —
 * крупно одно под другим, дальше сеткой 2 × 2; больше четырёх — стена листает сама раз в 20 с.
 * Открытых дел нет — «Все дела сданы» и сданное сегодня. Гостю — имя, должность и сданное
 * сегодня, без карточек дел (D-33). Внизу тающая полоска времени на стене.
 *
 * Чего здесь нет и не будет: «просрочено», красного цвета, отказов и доработок отдельным словом,
 * места ниже пятого, падения очков и «в срок» рядом со «сдано» (D-45). Правила — lib/tv/focus.ts.
 */

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text)",
};

const EASE = [0.2, 0, 0, 1] as const;

export function TvFocus({ focus, remainingMs, now }: { focus: TvFocusEmployee; remainingMs: number; now: Date }) {
  const view = focusPeople(focus, now);
  const rating = ratingView(focus);
  const minutes = Math.ceil(remainingMs / 60_000);
  const { name, position } = focus.employee;
  const avatar = focus.employee.avatar_url ?? null;

  if (view.guest) return <GuestFocus name={name} position={position} avatar={avatar} today={view.today} minutes={minutes} remainingMs={remainingMs} />;

  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2vh]" data-testid="tv-focus">
      <div className="grid min-h-0 flex-1 gap-[4vh]" style={{ gridTemplateColumns: "44vh minmax(0,1fr)" }}>
        {/* the person */}
        <motion.aside
          initial={{ opacity: 0, y: "1.6vh" }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          // blocks in the order they matter; a column wraps what does not fit into a second column that
          // the box cuts off — at a big «Крупность» the last blocks leave whole, never cut in half
          className="flex min-h-0 flex-col flex-wrap content-start gap-[2.4vh] overflow-hidden p-[0.6vh]"
        >
          <div className="flex w-full flex-col gap-[1.6vh]">
            <Face name={name} avatar={avatar} size={10} />
            <div className="min-w-0">
              <p className="tv-lead line-clamp-2 font-bold tracking-[-0.02em]">{name}</p>
              {position ? <p className="tv-caption line-clamp-1 text-muted">{position}</p> : null}
            </div>
          </div>

          {/* how many are where — only the stages that have orders: a zero says nothing */}
          {view.counts.length > 0 ? (
            // a row per stage — «2 новых», «4 в работе», «1 на проверке»: three columns broke «на проверке» at «далеко»
            <div className="flex w-full flex-col gap-[0.4vh]">
              {view.counts.map((count) => (
                <p key={count.key} className="tv-lead flex min-w-0 items-baseline gap-[1.4vh]" data-lane={count.key}>
                  <span className="nums font-bold tabular-nums" style={{ color: TONE[count.tone] }}>
                    {count.value}
                  </span>
                  <span className="tv-text text-muted">{count.word}</span>
                </p>
              ))}
            </div>
          ) : null}

          {view.today ? <Today count={view.today} /> : null}

          {rating ? <TvRating view={rating} /> : null}
        </motion.aside>

        {/* the orders: title, deadline, four stations */}
        <section className="flex min-h-0 flex-col gap-[2vh]">
          {view.mode === "open" ? (
            <header className="flex items-baseline justify-between gap-[2vh]">
              <p className="tv-text font-semibold">
                Открытые дела <span className="nums tabular-nums text-muted">· {view.total}</span>
              </p>
              <div className="flex items-center gap-[2vh]">
                {view.hidden > 0 ? <span className="tv-caption nums tabular-nums text-muted">показаны {view.total - view.hidden}</span> : null}
                {view.pages > 1 ? <PageDots page={view.page} pages={view.pages} /> : null}
              </div>
            </header>
          ) : null}

          {view.mode === "clear" && view.clear ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
              className="flex flex-1 flex-col justify-center gap-[2vh]"
              data-testid="tv-focus-clear"
            >
              <p className="tv-title flex items-center gap-[2vh] font-bold" style={{ color: "var(--ok)" }}>
                <CheckIcon />
                {view.clear.title}
              </p>
              {view.clear.line ? <p className="tv-lead nums tabular-nums text-muted">{view.clear.line}</p> : null}
            </motion.div>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={view.page}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.4, ease: EASE }}
                className="grid min-h-0 flex-1 gap-[2.4vh]"
                style={
                  view.large
                    ? { gridTemplateColumns: "minmax(0, 1fr)", alignContent: "start" }
                    : { gridTemplateColumns: "repeat(2, minmax(0, 1fr))", alignContent: "start" }
                }
                data-page={view.page}
              >
                {view.plates.map((plate, index) => (
                  <TvTaskCard key={plate.id} plate={plate} index={index} large={view.large} />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </section>
      </div>

      <Gauge minutes={minutes} remainingMs={remainingMs} />
    </div>
  );
}

/**
 * A guest in the office (D-33): the person — first name, position — and how much they handed in
 * today. No plates: «Поручение · Ждёт принятия» four times over tells the room nothing.
 */
function GuestFocus({
  name,
  position,
  avatar,
  today,
  minutes,
  remainingMs,
}: {
  name: string;
  position: string | null;
  avatar: string | null;
  today: number | null;
  minutes: number;
  remainingMs: number;
}) {
  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2vh]" data-testid="tv-focus" data-guest="1">
      <motion.div
        initial={{ opacity: 0, y: "1.6vh" }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[3vh] text-center"
      >
        <Face name={name} avatar={avatar} size={22} />
        <div className="min-w-0">
          <p className="tv-title font-bold tracking-[-0.02em] [overflow-wrap:anywhere]">{name}</p>
          {position ? <p className="tv-lead mt-[1vh] text-muted">{position}</p> : null}
        </div>
        {today ? <Today count={today} big /> : null}
      </motion.div>
      <Gauge minutes={minutes} remainingMs={remainingMs} />
    </div>
  );
}

function Face({ name, avatar, size }: { name: string; avatar: string | null; size: number }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold leading-none"
      style={{
        width: `${size}vh`,
        height: `${size}vh`,
        fontSize: `${size * 0.42}vh`,
        background: "color-mix(in srgb, var(--accent-2) 30%, var(--surface-2))",
        boxShadow: `0 0 0 ${size * 0.04}vh color-mix(in srgb, var(--accent-2) 55%, transparent)`,
      }}
    >
      {avatar ? (
        // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
        <img src={avatar} alt="" className="h-full w-full object-cover" />
      ) : (
        initialsOfName(name)
      )}
    </span>
  );
}

function Today({ count, big = false }: { count: number; big?: boolean }) {
  return (
    <p className={`${big ? "tv-lead justify-center" : "tv-text"} flex w-full items-center gap-[1.2vh] font-semibold`} style={{ color: "var(--ok)" }}>
      <CheckIcon />
      <span>
        сегодня сдано <span className="nums tabular-nums">{count}</span>
      </span>
    </p>
  );
}

/** How long the person stays on the wall: the bar melts, the words say it. */
function Gauge({ minutes, remainingMs }: { minutes: number; remainingMs: number }) {
  if (minutes <= 0) return null;
  return (
    <div className="flex shrink-0 items-center gap-[2vh]">
      <div className="h-[0.5vh] flex-1 overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
        <div
          className={`h-full w-full rounded-full ${s.gauge}`}
          style={{ background: "var(--accent-2)", transform: `scaleX(${Math.min(1, remainingMs / FOCUS_MS)})` }}
        />
      </div>
      <span className="tv-caption shrink-0 text-muted">на экране ещё {minutes} мин</span>
    </div>
  );
}

/** Где стена сейчас, если дел больше четырёх: точки страниц, текущая — светлая. */
function PageDots({ page, pages }: { page: number; pages: number }) {
  return (
    <span className="flex items-center gap-[1vh]" aria-label={`Страница ${page + 1} из ${pages}`}>
      {Array.from({ length: pages }, (_, index) => (
        <span key={index} className="relative h-[1.2vh] w-[1.2vh] rounded-full" style={{ background: "var(--border)" }}>
          {/* the light dot shows by opacity, not by a colour change */}
          <span
            className="absolute inset-0 rounded-full"
            style={{ background: "var(--text)", opacity: index === page ? 1 : 0, transition: "opacity 400ms var(--ease-in-out)" }}
          />
        </span>
      ))}
    </span>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden className="h-[1em] w-[1em] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12.5l4.2 4.2L19 7" />
    </svg>
  );
}
