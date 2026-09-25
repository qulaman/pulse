"use client";

import { AnimatePresence, motion } from "framer-motion";

import { focusCard, initialsOfName, ratingView, storyBoard, type FocusLane, type FocusTone } from "@/lib/tv/focus";
import type { TvFocusEmployee } from "@/lib/tv/queries";
import { FOCUS_MS } from "@/lib/tv/state";

import { TvRating } from "./TvRating";
import { TvTaskCard } from "./TvTaskCard";
import s from "./tv.module.css";

/**
 * Сотрудник на стене (D-76 §10; D-96; карточки с хронологией — D-120): директор нажал в
 * телефоне — на стене человек и его дела, и по каждому делу видно, как оно шло.
 *
 * Композиция: слева колонка человека — фото или инициалы, имя, должность, числа по
 * стадиям, рейтинг недели и итоги недели, «Сегодня сдано»; справа — дела карточками с
 * хронологией (до двух — одной строкой крупно, дальше сеткой 2 × 2; больше четырёх — стена
 * листает сама раз в 20 секунд). Открытых дел нет — сданное за неделю, его история.
 * Внизу тающая полоска времени на стене.
 *
 * Чего здесь нет и не будет: слова «просрочено», красного цвета, отказов и доработок
 * отдельным словом, места ниже пятого и падения очков. Негатив по именам на экран в
 * кабинете не выносится (D-45). Правила живут в lib/tv/focus.ts, здесь только раскладка.
 */

const TONE: Record<FocusTone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  muted: "var(--text-muted)",
};

const LANE_WORD: Record<FocusLane["key"], string> = { new: "новые", work: "в работе", review: "на проверке" };

const EASE = [0.2, 0, 0, 1] as const;

export function TvFocus({ focus, remainingMs, now }: { focus: TvFocusEmployee; remainingMs: number; now: Date }) {
  const card = focusCard(focus, now);
  const board = storyBoard(focus, now);
  const rating = ratingView(focus);
  const minutes = Math.ceil(remainingMs / 60_000);
  const { name, position } = focus.employee;
  const avatar = focus.employee.avatar_url ?? null;
  const large = board.rows === 1;

  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2vh]" data-testid="tv-focus">
      <div className="grid min-h-0 flex-1 gap-[4vh]" style={{ gridTemplateColumns: "44vh minmax(0,1fr)" }}>
        {/* the person */}
        <motion.aside
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="flex min-h-0 flex-col gap-[2.6vh] overflow-hidden p-[0.6vh]"
        >
          <div className="flex flex-col gap-[1.8vh]">
            <span
              className="flex h-[12vh] w-[12vh] shrink-0 items-center justify-center overflow-hidden rounded-full text-[5.2vh] font-bold leading-none"
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
            <div className="min-w-0">
              <p className="line-clamp-2 text-[5vh] font-bold leading-[5.6vh] tracking-[-0.02em]">{name}</p>
              {position ? <p className="mt-[0.4vh] line-clamp-2 text-[2.6vh] leading-[3.2vh] text-muted">{position}</p> : null}
            </div>
          </div>

          {/* how many are where: all open orders, not only the shown ones */}
          <div className="grid grid-cols-3 gap-[1.6vh]">
            {card.lanes.map((lane) => (
              <div key={lane.key} className="min-w-0" data-lane={lane.key}>
                <p
                  className="text-[6vh] font-bold leading-[6.4vh] tabular-nums"
                  style={{ color: lane.count > 0 ? TONE[lane.tone] : "var(--text-muted)" }}
                >
                  {lane.count}
                </p>
                <p className="truncate text-[2.1vh] leading-[2.6vh] text-muted">{LANE_WORD[lane.key]}</p>
              </div>
            ))}
          </div>

          {rating ? <TvRating view={rating} today={card.done.count} /> : null}

          {/* a guest or a v2 base: no week block to carry «today», so it stands alone */}
          {card.done.count > 0 && !rating?.week ? (
            <p className="flex items-center gap-[1.2vh] text-[3vh] font-semibold leading-[3.8vh]" style={{ color: "var(--ok)" }}>
              <CheckIcon />
              Сегодня сдано: {card.done.count}
            </p>
          ) : null}
        </motion.aside>

        {/* the orders, each with its story */}
        <section className="flex min-h-0 flex-col gap-[1.8vh]">
          <header className="flex items-baseline justify-between gap-[2vh]">
            <p className="text-[3vh] font-semibold leading-[3.8vh]">
              {board.mode === "open" ? (
                <>
                  Открытые дела <span className="tabular-nums text-muted">· {board.total}</span>
                </>
              ) : board.mode === "done" ? (
                <>
                  Открытых дел нет <span className="text-muted">· сдано за неделю</span>
                </>
              ) : null}
            </p>
            <div className="flex items-center gap-[2vh]">
              {board.hidden > 0 ? (
                <span className="text-[2.2vh] leading-[2.8vh] text-muted tabular-nums">показаны {board.total - board.hidden}</span>
              ) : null}
              {board.pages > 1 ? <PageDots page={board.page} pages={board.pages} /> : null}
            </div>
          </header>

          {board.mode === "empty" ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.15, ease: EASE }}
              className="flex flex-1 flex-col justify-center gap-[1.4vh]"
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
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={board.page}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.25 } }}
                transition={{ duration: 0.4, ease: EASE }}
                className="grid min-h-0 flex-1 gap-[2.4vh]"
                style={{
                  gridTemplateColumns: `repeat(${board.cols}, minmax(0, 1fr))`,
                  gridTemplateRows: large ? undefined : `repeat(${board.rows}, minmax(0, 1fr))`,
                  alignContent: large ? "start" : undefined,
                }}
                data-page={board.page}
              >
                {board.cards.map((item, index) => (
                  <TvTaskCard key={item.id} card={item} index={index} large={large} />
                ))}
              </motion.div>
            </AnimatePresence>
          )}
        </section>
      </div>

      {/* how long the person stays on the wall: the bar melts, the words say it */}
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

/** Где стена сейчас, если дел больше шести: точки страниц, текущая — светлая. Цвет — единственное, что меняется. */
function PageDots({ page, pages }: { page: number; pages: number }) {
  return (
    <span className="flex items-center gap-[1vh]" aria-label={`Страница ${page + 1} из ${pages}`}>
      {Array.from({ length: pages }, (_, index) => (
        <span
          key={index}
          className="h-[1.2vh] w-[1.2vh] rounded-full"
          style={{
            background: index === page ? "var(--text)" : "var(--border)",
            transition: "background-color 400ms var(--ease-in-out)",
          }}
        />
      ))}
    </span>
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
