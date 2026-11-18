"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import { tvTime } from "@/lib/tv/clock";
import { leadersView, ranksOf, risenIds, type LeaderCard } from "@/lib/tv/leaders";
import type { TvRatingScene } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * Заставка «Рейтинг» (D-123; v5 — D-182): пьедестал первой тройки, четвёртый и пятый рядом, кто
 * вырос больше всех, последние награды с причиной и итог команды за период. Читается с 3–5 м:
 * первый — самый крупный, очки — золотом; сданное — одним числом («сдано 6»).
 *
 * Обгон — движением: поднявшийся едет на своё новое место (FLIP, только transform), его ступень
 * один раз вспыхивает золотом (opacity). Места и ступени стоят — двигаются люди.
 *
 * Чего здесь нет и не будет: шестого места и ниже, падения, штрафов, покупок в магазине и «в срок»
 * рядом со «сдано» — плохое по имени на стену не выносится (D-45). Гость в кабинете — заставка
 * скрыта, как доска (D-33). Правила — `lib/tv/leaders.ts`, здесь только раскладка.
 */

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (components/rating/Podium.tsx). */
const MEDAL = ["var(--gold)", "#B8C2CC", "#C98A5B"];
/** Высота ступени пьедестала по месту: первый выше всех. */
const STEP_VH = [15, 10.5, 7.5];

const EASE = [0.2, 0, 0, 1] as const;
/** The ride to a new place: slow enough to follow from the far end of the office. */
const RIDE = { duration: 0.9, ease: [0.4, 0, 0.2, 1] } as const;

export function TvLeaders({ data, now }: { data: TvRatingScene | null; now: Date }) {
  const view = leadersView(data, now);
  const climb = useClimb(ranksOf(view));
  // a full column (two places and the riser) leaves room for two rewards, not three
  const awards = view.state === "ready" ? view.awards.slice(0, view.rest.length + (view.riser ? 1 : 0) >= 3 ? 2 : 3) : [];

  if (view.state === "hidden") {
    // no data yet or a guest in the office: the clock, and why there is no rating (D-33)
    return data?.hidden ? (
      <div className="flex flex-col items-center gap-[2vh]" data-testid="tv-rating-hidden">
        <p className="tv-giant nums font-bold tabular-nums">{tvTime(now)}</p>
        <p className="tv-text text-muted">Рейтинг скрыт · гость в кабинете</p>
      </div>
    ) : null;
  }
  if (view.state === "off") {
    return <p className="tv-lead text-muted">Рейтинг появится, когда включат очки</p>;
  }

  return (
    <div className="flex h-[76vh] w-full max-w-[94vw] flex-col gap-[2.4vh]" data-testid="tv-rating">
      <header className="flex items-end justify-between gap-[4vh]">
        {/* the heading keeps one line; the team's line beside it wraps instead */}
        <div className="shrink-0">
          <p className="tv-caption font-display font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--gold)" }}>
            {view.span}
          </p>
          <h2 className="tv-title mt-[0.4vh] whitespace-nowrap font-bold tracking-[-0.03em]">{view.title}</h2>
        </div>
        {view.team.length > 0 ? (
          <p className="tv-text min-w-0 pb-[1vh] text-right">
            <span className="text-muted">Команда: </span>
            <span className="nums font-semibold tabular-nums">{view.team.join(" · ")}</span>
          </p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-[5vh]" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        {/* the podium: second, first, third */}
        {view.empty ? (
          <div className="flex flex-col justify-center gap-[1.6vh]">
            <p className="tv-lead font-semibold">Очков за этот период пока нет</p>
            <p className="tv-text text-muted">Первые награды поставят людей на пьедестал</p>
          </div>
        ) : (
          <section className="flex min-h-0 items-end justify-center gap-[2.4vh]" aria-label="Первая тройка">
            {/* keyed by place: the steps stay, the people ride between them */}
            {view.podium.map((card, index) => (
              <PodiumColumn key={card.rank} card={card} order={index} climb={climb} />
            ))}
          </section>
        )}

        {/* a column that wraps what does not fit into a second column the box cuts off: at a big «Крупность»
            the last rewards leave whole, never cut in half */}
        <aside className="flex min-h-0 flex-col flex-wrap content-start gap-[2vh] overflow-hidden">
          {view.rest.length > 0 ? (
            <ol className="flex w-full flex-col gap-[1.2vh]">
              {view.rest.map((card, index) => (
                <motion.li
                  key={card.rank}
                  initial={{ opacity: 0, y: "1.2vh" }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.5 + index * 0.08, ease: EASE }}
                  className="relative flex items-center gap-[1.8vh] overflow-hidden rounded-[1.8vh] px-[2vh] py-[1vh]"
                  style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
                >
                  <Flash on={climb.risen.has(card.id)} stamp={`${card.id}:${climb.stamp}`} />
                  <span className="tv-text nums relative w-[3.4vh] shrink-0 text-center font-bold tabular-nums text-muted">{card.rank}</span>
                  <Rider id={card.id} order={climb.stamp} className="relative min-w-0 flex-1">
                    <div className="flex items-center gap-[1.8vh]">
                      <TvAvatar name={card.name} src={card.avatar} size={6} yields />
                      <span className="tv-text min-w-0 flex-1 truncate font-semibold">{card.name}</span>
                      <span className="tv-lead nums shrink-0 font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                        <RollingNumber value={card.points} />
                      </span>
                    </div>
                  </Rider>
                </motion.li>
              ))}
            </ol>
          ) : null}

          {view.riser ? (
            <motion.section
              initial={{ opacity: 0, y: "1.2vh" }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.7, ease: EASE }}
              className="flex w-full items-center gap-[2vh] rounded-[1.8vh] px-[2vh] py-[1.2vh]"
              style={{ background: "color-mix(in srgb, var(--ok) 10%, var(--surface))" }}
            >
              <TvAvatar name={view.riser.name} src={view.riser.avatar} size={7} yields />
              <div className="min-w-0">
                <p className="tv-caption font-semibold" style={{ color: "var(--ok)" }}>
                  Рост периода
                </p>
                <p className="tv-text truncate font-semibold">{view.riser.name}</p>
                <p className="tv-caption nums font-semibold tabular-nums" style={{ color: "var(--ok)" }}>
                  {view.riser.delta}
                </p>
              </div>
            </motion.section>
          ) : null}

          {awards.length > 0
            ? awards.map((award, index) => (
                  <motion.div
                    key={award.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.85 + index * 0.08, ease: EASE }}
                    className="w-full min-w-0"
                  >
                    {/* the label rides with the first reward: it never stays on the wall without one */}
                    {index === 0 ? (
                      <p className="tv-caption mb-[0.6vh] font-semibold" style={{ color: "var(--gold)" }}>
                        Награды
                      </p>
                    ) : null}
                    <p className="tv-text flex items-baseline gap-[1.2vh]">
                      <span className="nums shrink-0 font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                        {award.amount}
                      </span>
                      <span className="min-w-0 truncate font-semibold">{award.name}</span>
                      <span className="tv-caption nums ml-auto shrink-0 tabular-nums text-muted">{award.time}</span>
                    </p>
                    {award.reason ? <p className="tv-caption truncate text-muted">{award.reason}</p> : null}
                  </motion.div>
                ))
            : null}
        </aside>
      </div>
    </div>
  );
}

/** One column of the podium: the face, the name, the points, and the step with the place under them. */
function PodiumColumn({ card, order, climb }: { card: LeaderCard; order: number; climb: Climb }) {
  const first = card.rank === 1;
  const medal = MEDAL[card.rank - 1] ?? "var(--border)";
  // the first rises last: the second and the third set the stage for it
  const delay = card.rank === 1 ? 0.35 : 0.1 + order * 0.08;
  const step = STEP_VH[card.rank - 1] ?? 6;
  return (
    <motion.div
      initial={{ opacity: 0, y: "3vh" }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className="flex min-w-0 flex-1 flex-col items-center"
      style={{ maxWidth: first ? "38%" : "31%" }}
      data-rank={card.rank}
    >
      <Rider id={card.id} order={climb.stamp} className="w-full">
        <div className="flex flex-col items-center">
          <TvAvatar name={card.name} src={card.avatar} size={first ? 14 : 10.5} ring={medal} yields />
          <p className={`${first ? "tv-lead" : "tv-text"} mt-[1.6vh] line-clamp-2 text-center font-bold tracking-[-0.01em] [overflow-wrap:anywhere]`}>
            {card.name}
          </p>
          <p className="mt-[0.4vh] flex items-baseline gap-[0.8vh]">
            <span className={`${first ? "tv-title" : "tv-lead"} nums font-bold tabular-nums`} style={{ color: "var(--gold)" }}>
              <RollingNumber value={card.points} />
            </span>
            <span className="tv-caption text-muted">{card.pointsWord}</span>
          </p>
          {card.delta !== null ? (
            <p className="tv-caption nums font-semibold tabular-nums" style={{ color: "var(--ok)" }}>
              ▲ +{card.delta}
            </p>
          ) : null}
          {card.done ? <p className="tv-caption max-w-full truncate text-muted">{card.done}</p> : null}
        </div>
      </Rider>
      {/* the step: its height says the place before the number does; it yields to big type like the faces */}
      <div
        className="relative mt-[1.2vh] flex w-full items-start justify-center overflow-hidden rounded-t-[1.6vh] pt-[1vh]"
        style={{
          // never lower than its own number: at «далеко» the third step still holds its «3»
          height: `max(calc(${step}vh * (2.3 - var(--tv-k, 1)) / 1.3), calc(4.4vh * var(--tv-k, 1) * 1.2 + 1.4vh))`,
          background: `linear-gradient(to bottom, color-mix(in srgb, ${medal} 26%, var(--surface)), color-mix(in srgb, var(--surface) 70%, transparent))`,
          boxShadow: `inset 0 0.5vh 0 ${medal}`,
        }}
      >
        <Flash on={climb.risen.has(card.id)} stamp={`${card.id}:${climb.stamp}`} />
        <span className="tv-lead nums relative font-bold tabular-nums" style={{ color: medal }}>
          {card.rank}
        </span>
      </div>
    </motion.div>
  );
}

type Climb = { stamp: string; risen: ReadonlySet<string> };

/**
 * Who climbed since the last picture (D-182): the order of the five is kept from render to render,
 * and when it changes the climbers are those `risenIds` names. A picture is a stamp of «who is where»,
 * so the clock's re-renders never count as a change.
 */
function useClimb(ranks: Record<string, number>): Climb {
  const stamp = Object.entries(ranks)
    .sort(([, a], [, b]) => a - b)
    .map(([id, rank]) => `${rank}:${id}`)
    .join("|");
  const [seen, setSeen] = useState<{ stamp: string; ranks: Record<string, number>; risen: string[] }>(() => ({ stamp, ranks, risen: [] }));
  if (seen.stamp !== stamp) setSeen({ stamp, ranks, risen: risenIds(seen.ranks, ranks) });
  return { stamp: seen.stamp, risen: new Set(seen.risen) };
}

/**
 * Who holds a place. The block carries the person's `layoutId`: when an award reorders the five, the
 * person leaves one place and appears at another, and Motion slides them from the old box to the new
 * one — position only (`layout="position"`), so a face never stretches between a step's size and a
 * row's. The slide is measured only when the order changes (`layoutDependency`), not on every tick.
 */
function Rider({ id, order, className = "", children }: { id: string; order: string; className?: string; children: ReactNode }) {
  return (
    <motion.div layoutId={`tv-leader-${id}`} layout="position" layoutDependency={order} transition={{ layout: RIDE }} className={className}>
      {children}
    </motion.div>
  );
}

/** The gold flash of a step a climber landed on: once, opacity only (D-45). */
function Flash({ on, stamp }: { on: boolean; stamp: string }) {
  if (!on) return null;
  return (
    <motion.span
      key={stamp}
      aria-hidden
      className="pointer-events-none absolute inset-0 block"
      style={{ background: "color-mix(in srgb, var(--gold) 55%, transparent)" }}
      initial={{ opacity: 0 }}
      animate={{ opacity: [0, 1, 0] }}
      transition={{ duration: 1.4, delay: RIDE.duration * 0.6, times: [0, 0.3, 1], ease: "easeInOut" }}
    />
  );
}
