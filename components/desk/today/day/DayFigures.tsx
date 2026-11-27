"use client";

import { Check, ClipboardCheck, MonitorUp, TrendingUp, Trophy } from "lucide-react";
import { LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import { toast } from "@/components/ui/Toast";
import type { TeamDay, TeamDayRow } from "@/lib/daily-report/types";
import { springs } from "@/lib/design/tokens";
import { topOf } from "@/lib/desk/home";
import { shortName } from "@/lib/people/names";
import type { RatingRow } from "@/lib/points/queries";
import { useTvControl } from "@/lib/tv/mutations";

import { Bar, Card, Ghost, Head, Person, Pill } from "./kit";

/*
 * «Цифры дня» (D-196): two tiles with one big number each — the day's reports and the week's
 * leader. A figure rolls when it grows (RollingNumber, D-45: a fall changes at once); a person is
 * their circle, ringed in the colour of their report; the week is a race whose crown flies to a new
 * leader. Every figure is the same query as before (D-152, D-123).
 */

const HAND_ORDER: Partial<Record<TeamDayRow["state"], number>> = { submitted: 0, pending: 1, missed: 2 };
const HAND_WORD: Partial<Record<TeamDayRow["state"], string>> = { submitted: "сдал отчёт", missed: "нет отчёта", pending: "ещё не сдал" };
/** More people than this — circles only for those still to hand in; the bar tells the rest. */
const FACES_MAX = 10;

/** The day's reports, «3/9» (D-152): who handed in, who not yet — the figure, a segment a person, their circles. */
export function ReportsTile({ day, index }: { day: TeamDay; index: number }) {
  const due = day.rows.filter((row) => row.state === "submitted" || row.state === "pending" || row.state === "missed");
  const handed = due.filter((row) => row.state === "submitted").length;
  const missed = due.filter((row) => row.state === "missed").length;
  const all = due.length > 0 && handed === due.length;
  // handed in first, then not yet, then missed: the bar reads left to right as the day did
  const bar = [...due].sort((a, b) => (HAND_ORDER[a.state] ?? 3) - (HAND_ORDER[b.state] ?? 3));
  const faces = due.length <= FACES_MAX ? bar : bar.filter((row) => row.state !== "submitted");
  const quiet = !day.workday ? "Сегодня не рабочий день — отчёты не ждём" : due.length === 0 ? "Сегодня отчёт сдавать некому" : null;
  return (
    <Card ink="ok" ok={all} index={index} testId="today-reports">
      <Head icon={ClipboardCheck} sign="reports" title="Отчёты" href="/desk/reports">
        {missed > 0 ? <Pill ink="pencil">нет отчёта · {missed}</Pill> : null}
      </Head>
      {quiet ? (
        <p className="py-2 text-[13px] leading-5 day-muted">{quiet}</p>
      ) : (
        <div className="flex flex-col gap-2.5 pb-1" data-testid="today-reports-day">
          <span className="flex items-baseline gap-2">
            <span className="day-figure nums">
              <RollingNumber value={handed} />
              <span className="day-figure-of">/{due.length}</span>
            </span>
            <span className="text-[12px] day-muted">{all ? "все сдали" : handed === 0 ? "пока никто не сдал" : "сдали"}</span>
          </span>
          <span className="day-segs" data-all={all ? "" : undefined} role="img" aria-label={`Сдали ${handed} из ${due.length}`}>
            {bar.map((row, i) => (
              <span
                key={row.user_id}
                className="day-seg"
                title={`${shortName(row.full_name)} — ${HAND_WORD[row.state] ?? ""}`}
                style={{ "--i": i, "--on": row.state === "pending" ? 0 : 1, "--seg": row.state === "missed" ? "var(--pencil)" : "var(--ok-ink)" } as CSSProperties}
              >
                <i />
              </span>
            ))}
          </span>
          {faces.length > 0 ? (
            <span className="day-faces">
              {faces.map((row, i) => (
                <motion.span
                  key={row.user_id}
                  layout="position"
                  transition={springs.object}
                  className="day-hand"
                  data-state={row.state}
                  style={{ animationDelay: `${200 + Math.min(i, 10) * 35}ms` }}
                  title={`${shortName(row.full_name)} — ${HAND_WORD[row.state] ?? ""}`}
                >
                  <Person id={row.user_id} name={row.full_name} size={24} />
                </motion.span>
              ))}
            </span>
          ) : null}
        </div>
      )}
    </Card>
  );
}

/** «Отчёты» when the day did not load: the tile stays, with what happened in it. */
export function ReportsFailedTile({ note, index }: { note: ReactNode; index: number }) {
  return (
    <Card ink="ok" index={index} testId="today-reports">
      <Head icon={ClipboardCheck} sign="reports" title="Отчёты" href="/desk/reports" />
      {note}
    </Card>
  );
}

/** The crown: lucide's own outline, filled. */
function CrownGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden>
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
    </svg>
  );
}

/** How many of the week stand on the tile: the leader big, two behind. */
const RACERS = 3;

/**
 * «Неделя» (D-123, D-196): the week's top as a race — the leader big with the crown, two behind;
 * bars run at one speed, rows change places on an overtake and the crown flies to the new leader,
 * who breathes one gold ring. «На экран» puts the week's five on the wall. Only where the company
 * plays the points game; no points this week — a capsule of the quiet strip (TodayScreen).
 */
export function WeekTile({ rows, index }: { rows: readonly RatingRow[]; index: number }) {
  const control = useTvControl();
  const racers = useMemo(() => topOf(rows, RACERS), [rows]);
  const top = Math.max(1, racers[0]?.points ?? 1);
  const leader = racers[0]?.user_id;
  // a new leader breathes one gold ring; the leader the screen opened with does not
  const [firstLeader] = useState(leader);
  const crowned = leader !== firstLeader;
  const [onWall, setOnWall] = useState(false);
  useEffect(() => {
    if (!onWall) return;
    const timer = window.setTimeout(() => setOnWall(false), 1600);
    return () => clearTimeout(timer);
  }, [onWall]);
  return (
    <Card ink="gold" index={index} testId="home-rating">
      <Head icon={Trophy} sign="rating" title="Неделя" href="/desk/rating">
        <Ghost
          icon={onWall ? Check : MonitorUp}
          done={onWall}
          disabled={control.isPending}
          onPress={() =>
            control.mutate(
              { scene: "rating", rating: "week" },
              {
                onSuccess: () => {
                  setOnWall(true);
                  toast("На стене — рейтинг недели");
                },
              },
            )
          }
          title="Показать пятёрку недели на экране в офисе"
          testId="home-rating-wall"
        >
          {onWall ? "На стене" : "На экран"}
        </Ghost>
      </Head>
      <LayoutGroup id="today-week">
        <ol className="flex flex-col gap-1.5 pb-1" data-testid="home-rating-list">
          {racers.map((row, place) => {
            const first = place === 0;
            return (
              <motion.li key={row.user_id} layout="position" transition={springs.object} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2.5" data-testid="home-rating-row">
                <span className="day-racer-face" style={{ paddingTop: first ? 6 : 0 }}>
                  <Person id={row.user_id} name={row.display_name} size={first ? 34 : 22} />
                  {first ? (
                    <motion.span layoutId="today-crown" transition={springs.alive} className="day-crown" style={{ x: "-50%", y: "-38%", rotate: -8 }} title="1 место">
                      <CrownGlyph />
                    </motion.span>
                  ) : null}
                  {first && crowned ? <span key={leader} aria-hidden className="day-lead-ring" /> : null}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <span className={`truncate ${first ? "text-[14px] font-semibold" : "text-[13px] day-muted"}`} title={row.display_name}>
                    {shortName(row.display_name)}
                  </span>
                  {racers.length > 1 ? <Bar value={row.points} of={top} ink="gold" /> : null}
                </span>
                <span className="flex flex-col items-end">
                  <span className="nums font-semibold" style={{ color: "var(--gold-ink)", fontSize: first ? 22 : 13, lineHeight: first ? "26px" : "18px", letterSpacing: first ? "-0.02em" : 0 }}>
                    <RollingNumber value={row.points} />
                  </span>
                  {first && row.delta_vs_prev > 0 ? (
                    <span className="nums inline-flex items-center gap-0.5 text-[11px]" style={{ color: "var(--ok-ink)" }} title={`На ${row.delta_vs_prev} больше, чем за прошлую неделю`}>
                      <TrendingUp size={11} aria-hidden />
                      {row.delta_vs_prev}
                    </span>
                  ) : null}
                </span>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>
    </Card>
  );
}
