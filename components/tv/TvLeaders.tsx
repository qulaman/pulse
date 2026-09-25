"use client";

import { motion } from "framer-motion";

import { tvTime } from "@/lib/tv/clock";
import { leadersView, type LeaderCard } from "@/lib/tv/leaders";
import type { TvRatingScene } from "@/lib/tv/queries";

import { TvAvatar } from "./TvAvatar";

/**
 * Заставка «Рейтинг» (D-123): пьедестал первой тройки, четвёртый и пятый рядом, кто вырос
 * больше всех, последние награды с причиной и итог команды за период. Читается с двух
 * метров: первый — самый крупный, очки — золотом.
 *
 * Чего здесь нет и не будет: шестого места и ниже, падения, штрафов и покупок в магазине —
 * плохое по имени на стену не выносится (D-45). Гость в кабинете — заставка скрыта, как
 * доска (D-33). Правила — `lib/tv/leaders.ts`, здесь только раскладка.
 */

/** Кольца медалей — те же, что у пьедестала «Рейтинга» (components/rating/Podium.tsx). */
const MEDAL = ["var(--gold)", "#B8C2CC", "#C98A5B"];
/** Высота ступени пьедестала по месту: первый выше всех. */
const STEP_VH = [17, 11.5, 8];

const EASE = [0.2, 0, 0, 1] as const;

export function TvLeaders({ data, now }: { data: TvRatingScene | null; now: Date }) {
  const view = leadersView(data, now);
  // a full column (two places and the riser) leaves room for two rewards, not three
  const awards = view.state === "ready" ? view.awards.slice(0, view.rest.length + (view.riser ? 1 : 0) >= 3 ? 2 : 3) : [];

  if (view.state === "hidden") {
    // no data yet or a guest in the office: the clock, and why there is no rating (D-33)
    return data?.hidden ? (
      <div className="flex flex-col items-center gap-[2vh]" data-testid="tv-rating-hidden">
        <p className="nums text-[18vh] font-bold leading-[20vh] tabular-nums">{tvTime(now)}</p>
        <p className="text-[3.4vh] leading-[4.4vh] text-muted">Рейтинг скрыт · гость в кабинете</p>
      </div>
    ) : null;
  }
  if (view.state === "off") {
    return <p className="text-[4vh] leading-[5.4vh] text-muted">Рейтинг появится, когда включат очки</p>;
  }

  return (
    <div className="flex h-[74vh] w-full max-w-[94vw] flex-col gap-[3vh]" data-testid="tv-rating">
      <header className="flex items-end justify-between gap-[4vh]">
        <div className="min-w-0">
          <p className="font-display text-[2.4vh] font-semibold uppercase leading-[3vh] tracking-[0.14em]" style={{ color: "var(--gold)" }}>
            {view.span}
          </p>
          <h2 className="mt-[0.6vh] text-[7vh] font-bold leading-[8vh] tracking-[-0.03em]">{view.title}</h2>
        </div>
        {view.team.length > 0 ? (
          <p className="shrink-0 pb-[1vh] text-right text-[2.8vh] leading-[3.6vh]">
            <span className="text-muted">Команда: </span>
            <span className="font-semibold tabular-nums">{view.team.join(" · ")}</span>
          </p>
        ) : null}
      </header>

      <div className="grid min-h-0 flex-1 gap-[5vh]" style={{ gridTemplateColumns: "minmax(0, 1.3fr) minmax(0, 1fr)" }}>
        {/* the podium: second, first, third */}
        {view.empty ? (
          <div className="flex flex-col justify-center gap-[1.6vh]">
            <p className="text-[5vh] font-semibold leading-[6.4vh]">Очков за этот период пока нет</p>
            <p className="text-[3vh] leading-[4vh] text-muted">Первые награды поставят людей на пьедестал</p>
          </div>
        ) : (
          <section className="flex min-h-0 items-end justify-center gap-[2.4vh]" aria-label="Первая тройка">
            {view.podium.map((card, index) => (
              <PodiumColumn key={card.id} card={card} order={index} />
            ))}
          </section>
        )}

        <aside className="flex min-h-0 flex-col gap-[2.4vh] overflow-hidden">
          {view.rest.length > 0 ? (
            <ol className="flex flex-col gap-[1.2vh]">
              {view.rest.map((card, index) => (
                <motion.li
                  key={card.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, delay: 0.5 + index * 0.08, ease: EASE }}
                  className="flex items-center gap-[1.8vh] rounded-[1.8vh] px-[2vh] py-[1vh]"
                  style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)" }}
                >
                  <span className="w-[3.4vh] shrink-0 text-center text-[3vh] font-bold tabular-nums text-muted">{card.rank}</span>
                  <TvAvatar name={card.name} src={card.avatar} size={6} />
                  <span className="min-w-0 flex-1 truncate text-[3vh] font-semibold leading-[3.8vh]">{card.name}</span>
                  <span className="shrink-0 text-[3.4vh] font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                    {card.points}
                  </span>
                </motion.li>
              ))}
            </ol>
          ) : null}

          {view.riser ? (
            <motion.section
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45, delay: 0.7, ease: EASE }}
              className="flex items-center gap-[2vh] rounded-[1.8vh] px-[2vh] py-[1.2vh]"
              style={{ background: "color-mix(in srgb, var(--ok) 10%, var(--surface))" }}
            >
              <TvAvatar name={view.riser.name} src={view.riser.avatar} size={7} />
              <div className="min-w-0">
                <p className="text-[2.2vh] font-semibold leading-[2.8vh]" style={{ color: "var(--ok)" }}>
                  Рост периода
                </p>
                <p className="truncate text-[3.2vh] font-semibold leading-[4vh]">{view.riser.name}</p>
                <p className="text-[2.4vh] font-semibold leading-[3vh] tabular-nums" style={{ color: "var(--ok)" }}>
                  {view.riser.delta}
                </p>
              </div>
            </motion.section>
          ) : null}

          {awards.length > 0 ? (
            <section className="flex min-h-0 flex-col gap-[1.2vh]">
              <p className="text-[2.2vh] font-semibold leading-[2.8vh]" style={{ color: "var(--gold)" }}>
                Награды
              </p>
              <ul className="flex flex-col gap-[1vh]">
                {awards.map((award, index) => (
                  <motion.li
                    key={award.key}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 0.45, delay: 0.85 + index * 0.08, ease: EASE }}
                    className="min-w-0"
                  >
                    <p className="flex items-baseline gap-[1.2vh] text-[2.8vh] leading-[3.6vh]">
                      <span className="shrink-0 font-bold tabular-nums" style={{ color: "var(--gold)" }}>
                        {award.amount}
                      </span>
                      <span className="min-w-0 truncate font-semibold">{award.name}</span>
                      <span className="ml-auto shrink-0 text-[2.2vh] tabular-nums text-muted">{award.time}</span>
                    </p>
                    {award.reason ? <p className="truncate text-[2.4vh] leading-[3vh] text-muted">{award.reason}</p> : null}
                  </motion.li>
                ))}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

/** One column of the podium: the face, the name, the points, and the step with the place under them. */
function PodiumColumn({ card, order }: { card: LeaderCard; order: number }) {
  const first = card.rank === 1;
  const medal = MEDAL[card.rank - 1] ?? "var(--border)";
  // the first rises last: the second and the third set the stage for it
  const delay = card.rank === 1 ? 0.35 : 0.1 + order * 0.08;
  return (
    <motion.div
      initial={{ opacity: 0, y: 32 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className="flex min-w-0 flex-1 flex-col items-center"
      style={{ maxWidth: first ? "38%" : "31%" }}
      data-rank={card.rank}
    >
      <TvAvatar name={card.name} src={card.avatar} size={first ? 16 : 12} ring={medal} />
      <p
        className={`mt-[1.8vh] line-clamp-2 text-center font-bold leading-[1.15] tracking-[-0.01em] [overflow-wrap:anywhere] ${
          first ? "text-[4vh]" : "text-[3.2vh]"
        }`}
      >
        {card.name}
      </p>
      <p className="mt-[0.6vh] flex items-baseline gap-[0.8vh]">
        <span className={`font-bold tabular-nums ${first ? "text-[7vh] leading-[7.4vh]" : "text-[5vh] leading-[5.6vh]"}`} style={{ color: "var(--gold)" }}>
          {card.points}
        </span>
        <span className="text-[2.2vh] text-muted">{card.pointsWord}</span>
      </p>
      <p className="h-[3vh] text-[2.2vh] font-semibold leading-[3vh] tabular-nums" style={{ color: "var(--ok)" }}>
        {card.delta !== null ? `▲ +${card.delta}` : ""}
      </p>
      {card.done ? <p className="text-[2.2vh] leading-[2.8vh] text-muted">{card.done}</p> : <p className="h-[2.8vh]" />}
      {/* the step: its height says the place before the number does */}
      <div
        className="mt-[1.4vh] flex w-full items-start justify-center rounded-t-[1.6vh] pt-[1.2vh]"
        style={{
          height: `${STEP_VH[card.rank - 1] ?? 6}vh`,
          background: `linear-gradient(to bottom, color-mix(in srgb, ${medal} 26%, var(--surface)), color-mix(in srgb, var(--surface) 70%, transparent))`,
          boxShadow: `inset 0 0.5vh 0 ${medal}`,
        }}
      >
        <span className="text-[5vh] font-bold leading-[5.6vh] tabular-nums" style={{ color: medal }}>
          {card.rank}
        </span>
      </div>
    </motion.div>
  );
}
