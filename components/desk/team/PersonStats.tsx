"use client";

import {
  CircleCheck,
  CircleCheckBig,
  ClipboardCheck,
  Clock,
  Coins,
  Flame,
  Gauge,
  ListTodo,
  LogIn,
  LogOut,
  RotateCcw,
  Timer,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { RollingNumber } from "@/components/ui/RollingNumber";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { humanAqtobe } from "@/lib/ai/time";
import { dayName, hoursText, rangeText, shortHm, timeOf } from "@/lib/daily-report/format";
import { WEEKDAYS_SHORT_RU } from "@/lib/datetime/calendar";
import { formatNum } from "@/lib/desk/format";
import type { Load } from "@/lib/people/loads";
import { PERIOD_DAYS } from "@/lib/people/period";
import type { Person } from "@/lib/people/queries";
import {
  changeOf,
  median,
  monotonePath,
  percent,
  placeText,
  spanPosition,
  spanShort,
  STATS_WEEKS,
  usePersonStats,
  type Change,
  type PointsStats,
  type RatingSpot,
  type ReportCell,
  type ReportDayState,
  type ReportStats,
  type Source,
  type TaskStats,
  type WeekPoint,
} from "@/lib/people/stats";
import { pluralRu } from "@/lib/tasks/status-text";

import { Block, LoadFailed, useBoxWidth } from "./shared";

/*
 * A person's dashboard on the desk (D-172): the director's view of one employee as tiles — a figure
 * first, a picture under it (lib/people/stats.ts reads and counts). Each tile stands on its own read:
 * a failed one says so in its place and the rest still shows; nothing happened yet — words, never a
 * row of zeros. Motion (app/desk/person-stats.css): the tiles rise in, the figures count up from
 * zero, the week line draws itself, the ring sweeps, the days of reports pop in — ≤ 900 ms, transform,
 * opacity and stroke only, still under «уменьшить движение». Colour only where it means something:
 * green done and handed in, red late and missed, amber waiting, orange points, the pen's turquoise
 * for the one line.
 */

type TileKey = "done" | "onTime" | "now" | "speed" | "points" | "reports";

/* ---- the grid: 2 tiles a row in a narrow card, 4 in a wide one, rows always full ---------------- */

const MD_SPAN: Record<number, string> = { 1: "@min-[560px]:col-span-1", 2: "@min-[560px]:col-span-2" };
const LG_SPAN: Record<number, string> = { 1: "@min-[880px]:col-span-1", 2: "@min-[880px]:col-span-2", 3: "@min-[880px]:col-span-3", 4: "@min-[880px]:col-span-4" };

/** How many columns each tile takes at two and at four a row, so that no row is left with a hole. */
function spansOf(points: boolean, reports: boolean): Record<TileKey, [number, number]> {
  if (!points && !reports) return { done: [2, 1], onTime: [1, 1], now: [1, 1], speed: [2, 1], points: [1, 1], reports: [1, 1] };
  return {
    done: [2, 2],
    onTime: [1, 1],
    now: [1, 1],
    speed: [points ? 1 : 2, reports ? 1 : 2],
    points: [1, reports ? 1 : 2],
    reports: [2, points ? 2 : 3],
  };
}

export function PersonStats({ person, now }: { person: Person; now: Date }) {
  const { pointsEnabled } = useDeskScope();
  const stats = usePersonStats(person, now, pointsEnabled);
  const spans = spansOf(stats.points !== null, stats.reports !== null);
  const tiles: TileKey[] = ["done", "onTime", "now", "speed", ...(stats.points ? (["points"] as const) : []), ...(stats.reports ? (["reports"] as const) : [])];
  const place = (key: TileKey) => `${MD_SPAN[spans[key][0]]} ${LG_SPAN[spans[key][1]]}`;
  const order = (key: TileKey) => tiles.indexOf(key);

  return (
    <Block title="Показатели" testId="person-stats" end={<span className="text-[12px] leading-4 text-muted">{PERIOD_DAYS} дней · к прошлым {PERIOD_DAYS}</span>}>
      <div className="@container">
        <div className="grid grid-cols-1 gap-3 @min-[560px]:grid-cols-2 @min-[880px]:grid-cols-4">
          <DoneTile source={stats.tasks} index={order("done")} className={place("done")} />
          <OnTimeTile source={stats.tasks} index={order("onTime")} className={place("onTime")} />
          <NowTile source={stats.load} now={now} index={order("now")} className={place("now")} />
          <SpeedTile source={stats.tasks} index={order("speed")} className={place("speed")} />
          {stats.points ? <PointsTile source={stats.points} personId={person.id} index={order("points")} className={place("points")} /> : null}
          {stats.reports ? <ReportsTile source={stats.reports} now={now} index={order("reports")} className={place("reports")} /> : null}
        </div>
      </div>
    </Block>
  );
}

/* ---- the pieces every tile is made of ----------------------------------------------------------- */

/** A light that follows the pointer over a tile: written to the element, never through React state. */
function follow(event: PointerEvent<HTMLElement>) {
  const box = event.currentTarget.getBoundingClientRect();
  event.currentTarget.style.setProperty("--mx", `${Math.round(event.clientX - box.left)}px`);
  event.currentTarget.style.setProperty("--my", `${Math.round(event.clientY - box.top)}px`);
}

function Tile({
  tileKey,
  icon: Glyph,
  label,
  end,
  index,
  className = "",
  children,
}: {
  tileKey: TileKey;
  icon: LucideIcon;
  label: string;
  end?: ReactNode;
  index: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <article data-testid={`person-stat-${tileKey}`} className={`ps-tile ${className}`} style={{ "--i": index } as CSSProperties} onPointerMove={follow}>
      <header className="flex min-h-5 items-center gap-2">
        <Glyph aria-hidden size={14} strokeWidth={2} className="ps-icon shrink-0" />
        <h3 className="truncate text-[12px] font-medium leading-4 text-muted">{label}</h3>
        {end ? <span className="ml-auto flex shrink-0 items-center gap-1.5">{end}</span> : null}
      </header>
      {children}
    </article>
  );
}

/**
 * A tile's read in flight: the same tile, its figure, its line and its picture as bones of their
 * size (`picture` — the picture's height with the gap above it; `ring` — the ring beside the figure).
 */
function TileBones({ picture, ring = false }: { picture: number; ring?: boolean }) {
  return (
    <SkeletonGroup className="flex flex-1 flex-col gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-1 flex-col gap-2.5">
          <Bone h={32} w={96} />
          <Bone h={20} w="60%" />
        </div>
        {ring ? <Bone round w={80} h={80} className="shrink-0" /> : null}
      </div>
      {picture > 0 ? <Bone h={picture} className="mt-auto" /> : null}
    </SkeletonGroup>
  );
}

/** Loading, failed, or the tile's own content — the same three ways for every tile. */
function Body<T>({ source, what, bones, children }: { source: Source<T>; what: string; bones: ReactNode; children: (data: T) => ReactNode }) {
  if (source.data !== null) return <>{children(source.data)}</>;
  if (source.failed) return <LoadFailed what={what} onRetry={source.retry} />;
  return <>{bones}</>;
}

/**
 * A figure that counts up from zero when it first shows: zero on the first frame, the value on the
 * next, the roll in between (RollingNumber: a rise rolls, a fall just changes; still under «уменьшить
 * движение»). A later change rolls the same way.
 */
function Count({ value, className }: { value: number; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <RollingNumber value={shown} className={className} />;
}

/** The tile's figure: the number large, its unit beside it, small. */
function Figure({ children, unit, tone }: { children: ReactNode; unit?: ReactNode; tone?: "gold" | "muted" }) {
  return (
    <p className="flex min-h-8 flex-wrap items-baseline gap-x-1.5">
      <span className="ps-value" data-tone={tone}>
        {children}
      </span>
      {unit ? <span className="text-[13px] leading-5 text-muted">{unit}</span> : null}
    </p>
  );
}

type Good = "up" | "down";

/** A change against the 30 days before, on a small plate: green where it went the good way, red the bad, grey for no move. */
function Delta({ change, good, title }: { change: Change; good: Good; title: string }) {
  if (!change) return null;
  const better = good === "up" ? change.diff > 0 : change.diff < 0;
  const tone = change.diff === 0 ? "muted" : better ? "ok" : good === "down" ? "danger" : "muted";
  return (
    <span className="ps-delta nums" data-tone={tone} title={title}>
      {change.text}
    </span>
  );
}

/** Words in place of a figure: nothing happened yet, said as a sentence. */
function Quiet({ children, icon: Glyph }: { children: ReactNode; icon?: LucideIcon }) {
  return (
    <p className="ps-quiet flex items-start gap-2 text-[13px] leading-5 text-muted">
      {Glyph ? <Glyph aria-hidden size={16} strokeWidth={2} className="mt-0.5 shrink-0 text-ok" /> : null}
      <span>{children}</span>
    </p>
  );
}

const BEFORE = `к прошлым ${PERIOD_DAYS} дням`;

/* ---- Выполнено: all time, the 30 days, the week line --------------------------------------------- */

function DoneTile({ source, index, className }: { source: Source<TaskStats>; index: number; className: string }) {
  return (
    <Tile tileKey="done" icon={CircleCheckBig} label="Выполнено" index={index} className={className}>
      <Body source={source} what="задачи" bones={<TileBones picture={90} />}>
        {(stats) => {
          const lined = stats.series.some((week) => week.count > 0);
          if (stats.doneAll === 0 && stats.current.handed === 0 && !lined) return <Quiet>Выполненных задач пока нет</Quiet>;
          const compared = stats.previous.handed > 0 || stats.previous.returned > 0;
          return (
            <>
              <Figure unit="за всё время">
                <Count value={stats.doneAll} />
              </Figure>
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted">
                <span>
                  сдано за {PERIOD_DAYS} дней <span className="nums font-medium text-text">{formatNum(stats.current.handed)}</span>
                </span>
                <Delta change={compared ? changeOf(stats.current.handed, stats.previous.handed) : null} good="up" title={BEFORE} />
              </p>
              {lined ? <Spark series={stats.series} /> : <p className="mt-auto text-[12px] leading-4 text-muted">За {STATS_WEEKS} недель сданных задач нет</p>}
            </>
          );
        }}
      </Body>
    </Tile>
  );
}

const SPARK_H = 64;
const SPARK_TOP = 8;
const SPARK_BOTTOM = 6;
const SPARK_INSET = 5;

/**
 * Tasks handed in, week by week, as a line that draws itself, the area under it a wash of the pen.
 * The pointer finds the week: a hairline, a dot, and the week said under the line.
 */
function Spark({ series }: { series: WeekPoint[] }) {
  const [measure, width] = useBoxWidth();
  const [hover, setHover] = useState<number | null>(null);
  const id = `ps-spark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  const max = Math.max(1, ...series.map((week) => week.count));
  const step = series.length > 1 ? (width - 2 * SPARK_INSET) / (series.length - 1) : 0;
  const points = series.map((week, i) => ({ x: SPARK_INSET + i * step, y: SPARK_TOP + (1 - week.count / max) * (SPARK_H - SPARK_TOP - SPARK_BOTTOM) }));
  const line = monotonePath(points);
  const first = points[0];
  const last = points[points.length - 1];
  const area = `${line}L${last.x},${SPARK_H}L${first.x},${SPARK_H}Z`;
  const total = series.reduce((sum, week) => sum + week.count, 0);
  const hovered = hover === null ? null : series[hover];

  const pick = (event: PointerEvent<HTMLDivElement>) => {
    if (step <= 0) return;
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left;
    setHover(Math.max(0, Math.min(series.length - 1, Math.round((x - SPARK_INSET) / step))));
  };

  return (
    <figure className="mt-auto flex flex-col gap-1.5 pt-1">
      <div ref={measure} className="ps-spark relative" style={{ height: SPARK_H }} onPointerMove={pick} onPointerLeave={() => setHover(null)} data-testid="person-stat-spark">
        {width > 0 ? (
          <svg width={width} height={SPARK_H} role="img" aria-label={`Сдано по неделям за ${STATS_WEEKS} недель: ${series.map((week) => week.count).join(", ")}`} className="block overflow-visible">
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" className="ps-spark-stop-top" />
                <stop offset="1" className="ps-spark-stop-bottom" />
              </linearGradient>
            </defs>
            <line x1={0} x2={width} y1={SPARK_H - 0.5} y2={SPARK_H - 0.5} className="ps-spark-base" />
            <path d={area} fill={`url(#${id})`} className="ps-spark-area" />
            <path d={line} pathLength={1} className="ps-spark-line" />
            {hover !== null ? (
              <>
                <line x1={points[hover].x} x2={points[hover].x} y1={0} y2={SPARK_H} className="ps-spark-hair" />
                <circle cx={points[hover].x} cy={points[hover].y} r={4} className="ps-spark-dot" />
              </>
            ) : (
              <circle cx={last.x} cy={last.y} r={4} className="ps-spark-dot ps-spark-end" />
            )}
          </svg>
        ) : null}
      </div>
      <figcaption className="flex items-center justify-between gap-3 text-[12px] leading-4 text-muted" aria-live="polite">
        {hovered ? (
          <>
            <span>{rangeText(hovered.from, hovered.to)}</span>
            <span className="nums">
              сдано <span className="font-medium text-text">{hovered.count}</span>
            </span>
          </>
        ) : (
          <>
            <span>по неделям, {STATS_WEEKS} недель</span>
            <span className="nums">
              всего <span className="font-medium text-text">{formatNum(total)}</span>
            </span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

/* ---- В срок: the share and its ring ---------------------------------------------------------------- */

function OnTimeTile({ source, index, className }: { source: Source<TaskStats>; index: number; className: string }) {
  return (
    <Tile tileKey="onTime" icon={Clock} label="В срок" index={index} className={className}>
      <Body source={source} what="задачи" bones={<TileBones picture={0} ring />}>
        {(stats) => {
          const timed = stats.current.onTime + stats.current.late;
          const share = percent(stats.current.onTime, timed);
          const before = percent(stats.previous.onTime, stats.previous.onTime + stats.previous.late);
          if (share === null) {
            return (
              <div className="flex flex-1 items-start justify-between gap-3">
                <Quiet>За {PERIOD_DAYS} дней задач со сроком не сдано</Quiet>
                <Ring onTime={0} late={0} />
              </div>
            );
          }
          return (
            <div className="flex flex-1 items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-1">
                <Figure>
                  <Count value={share} />
                  <span className="ps-value-unit">%</span>
                </Figure>
                <p className="text-[13px] leading-5 text-muted">
                  <span className="nums font-medium text-text">{stats.current.onTime}</span> из <span className="nums">{timed}</span> со сроком
                </p>
                {stats.current.late > 0 ? (
                  <p className="text-[12px] leading-4 text-muted">
                    <span className="ps-swatch" data-tone="danger" /> позже срока — {stats.current.late}
                  </p>
                ) : null}
                <span className="mt-1 self-start">
                  <Delta change={changeOf(share, before, " п. п.")} good="up" title={BEFORE} />
                </span>
              </div>
              <Ring onTime={stats.current.onTime} late={stats.current.late} />
            </div>
          );
        }}
      </Body>
    </Tile>
  );
}

/** A circle from the top, clockwise; pathLength 100 makes its dashes percents. */
const CIRCLE = "M40,8 a32,32 0 1,1 0,64 a32,32 0 1,1 0,-64";
/** The gap between the two arcs, in percents of the circle (≈ 2 px). */
const ARC_GAP = 1.2;

/** On time in green, late in red, a hairline gap between; both sweep in from twelve o'clock. */
function Ring({ onTime, late }: { onTime: number; late: number }) {
  const total = onTime + late;
  const share = total > 0 ? (onTime / total) * 100 : 0;
  const both = onTime > 0 && late > 0;
  const green = both ? share - ARC_GAP : share;
  const red = both ? 100 - share - ARC_GAP : total > 0 && onTime === 0 ? 100 : 0;
  return (
    <svg width={80} height={80} viewBox="0 0 80 80" aria-hidden className="ps-ring shrink-0">
      <path d={CIRCLE} pathLength={100} className="ps-ring-track" />
      {green > 0 ? <path d={CIRCLE} pathLength={100} className="ps-ring-arc" data-tone="ok" strokeDasharray={`${green} ${100 - green}`} strokeDashoffset={both ? -ARC_GAP / 2 : 0} /> : null}
      {red > 0 ? (
        <path
          d={CIRCLE}
          pathLength={100}
          className="ps-ring-arc ps-ring-late"
          data-tone="danger"
          strokeDasharray={`${red} ${100 - red}`}
          strokeDashoffset={both ? -(share + ARC_GAP / 2) : 0}
        />
      ) : null}
    </svg>
  );
}

/* ---- Сейчас: what the person holds right now ------------------------------------------------------- */

function NowTile({ source, now, index, className }: { source: Source<Load>; now: Date; index: number; className: string }) {
  return (
    <Tile tileKey="now" icon={ListTodo} label="Сейчас" index={index} className={className}>
      <Body source={source} what="задачи в работе" bones={<TileBones picture={28} />}>
        {(load) => {
          if (load.active === 0) return <Quiet icon={CircleCheck}>Открытых задач нет</Quiet>;
          const working = Math.max(0, load.active - load.review - load.overdue);
          const nearest = load.overdue === 0 && load.nearest && new Date(load.nearest).getTime() > now.getTime() ? humanAqtobe(new Date(load.nearest), now) : null;
          // apart, so they add up to the figure: in work and not late, late, handed in and waiting
          const parts: Part[] = [
            { key: "working", label: "в работе", value: working, tone: "muted" },
            { key: "overdue", label: "просрочено", value: load.overdue, tone: "danger" },
            { key: "review", label: "на приёмке", value: load.review, tone: "warn" },
          ];
          return (
            <>
              <Figure unit={pluralRu(load.active, ["задача", "задачи", "задач"])}>
                <Count value={load.active} />
              </Figure>
              <dl className="grid grid-cols-3 gap-2">
                {parts.map((part) => (
                  <div key={part.key} className="flex min-w-0 flex-col">
                    <dt className="flex items-center gap-1.5 truncate text-[12px] leading-4 text-muted">
                      <span className="ps-swatch" data-tone={part.value > 0 ? part.tone : "quiet"} />
                      {part.label}
                    </dt>
                    <dd className="ps-small-value nums" data-tone={part.value > 0 && part.tone !== "muted" ? part.tone : undefined}>
                      {part.value}
                    </dd>
                  </div>
                ))}
              </dl>
              <div className="mt-auto flex flex-col gap-1.5">
                <PartsBar parts={parts} />
                {nearest ? <p className="text-[12px] leading-4 text-muted">ближайший срок — {nearest}</p> : null}
              </div>
            </>
          );
        }}
      </Body>
    </Tile>
  );
}

type Part = { key: string; label: string; value: number; tone: "ok" | "danger" | "muted" | "warn" };

/** One whole in parts, a thin bar: each part its ink and its share of the length, a hairline gap between; they grow in from the left. */
function PartsBar({ parts }: { parts: Part[] }) {
  return (
    <div className="ps-bar" role="img" aria-label={parts.map((part) => `${part.label} ${part.value}`).join(", ")}>
      {parts
        .filter((part) => part.value > 0)
        .map((part, i) => (
          <i key={part.key} data-tone={part.tone} style={{ flexGrow: part.value, animationDelay: `${120 + i * 70}ms` }} />
        ))}
    </div>
  );
}

/* ---- Скорость: given to handed in, and what came back -------------------------------------------- */

const SPAN_TICKS = [
  { at: 3_600_000, label: "1 ч" },
  { at: 86_400_000, label: "1 д" },
  { at: 7 * 86_400_000, label: "1 нед" },
];

function SpeedTile({ source, index, className }: { source: Source<TaskStats>; index: number; className: string }) {
  return (
    <Tile tileKey="speed" icon={Gauge} label="Скорость" index={index} className={className}>
      <Body source={source} what="задачи" bones={<TileBones picture={74} />}>
        {(stats) => {
          const typical = median(stats.spans);
          const compared = stats.previous.handed > 0 || stats.previous.returned > 0;
          return (
            <>
              {typical === null ? (
                <Quiet>За {PERIOD_DAYS} дней сданных задач нет</Quiet>
              ) : (
                <>
                  <Figure>
                    <span className="ps-fade">{spanShort(typical)}</span>
                  </Figure>
                  <p className="text-[13px] leading-5 text-muted">
                    обычно от выдачи до сдачи · <span className="nums">{stats.spans.length}</span> {pluralRu(stats.spans.length, ["задача", "задачи", "задач"])}
                  </p>
                  <Strip spans={stats.spans} typical={typical} />
                </>
              )}
              {/* «без возвратов» says something only of work that was handed in */}
              {typical !== null || stats.current.returned > 0 ? (
                <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] leading-5 text-muted ${typical === null ? "mt-auto" : ""}`}>
                  <RotateCcw aria-hidden size={13} strokeWidth={2} className="ps-icon shrink-0" />
                  {stats.current.returned > 0 ? (
                    <span>
                      на доработку — <span className="nums font-medium text-text">{stats.current.returned}</span>
                    </span>
                  ) : (
                    <span>без возвратов на доработку</span>
                  )}
                  <Delta change={compared ? changeOf(stats.current.returned, stats.previous.returned) : null} good="down" title={BEFORE} />
                </p>
              ) : null}
            </>
          );
        }}
      </Body>
    </Tile>
  );
}

/** Every hand-in of the 30 days as a dot on a log scale of time, the typical one in the pen. */
function Strip({ spans, typical }: { spans: number[]; typical: number }) {
  return (
    <figure className="mt-auto pt-2" aria-label={`Быстрее всего ${spanShort(Math.min(...spans))}, дольше всего ${spanShort(Math.max(...spans))}`}>
      <div className="ps-strip relative h-4">
        <span aria-hidden className="ps-strip-track" />
        {SPAN_TICKS.map((tick) => (
          <span key={tick.label} aria-hidden className="ps-strip-tick" style={{ left: `${spanPosition(tick.at) * 100}%` }} />
        ))}
        {spans.map((span, i) => (
          <span
            key={i}
            aria-hidden
            className="ps-strip-dot"
            title={spanShort(span)}
            style={{ left: `${spanPosition(span) * 100}%`, animationDelay: `${160 + Math.min(i, 24) * 18}ms` }}
          />
        ))}
        <span aria-hidden className="ps-strip-typical" title={`обычно ${spanShort(typical)}`} style={{ left: `${spanPosition(typical) * 100}%` }} />
      </div>
      <div className="relative mt-1 h-4 text-[11px] leading-4 text-muted" aria-hidden>
        {SPAN_TICKS.map((tick) => (
          <span key={tick.label} className="absolute -ml-6 w-12 text-center" style={{ left: `${spanPosition(tick.at) * 100}%` }}>
            {tick.label}
          </span>
        ))}
      </div>
    </figure>
  );
}

/* ---- Очки: the balance, the week, the place ----------------------------------------------------------- */

function PointsTile({ source, personId, index, className }: { source: Source<PointsStats>; personId: string; index: number; className: string }) {
  return (
    <Tile tileKey="points" icon={Coins} label="Очки" index={index} className={className}>
      <Body source={source} what="очки" bones={<TileBones picture={64} />}>
        {(stats) => {
          const week = stats.week;
          const month = stats.month;
          const moved = (week?.points ?? 0) !== 0 || (month?.points ?? 0) !== 0;
          if (stats.balance === 0 && !moved) return <Quiet>Очков пока нет</Quiet>;
          return (
            <>
              <Figure unit="на счёте" tone={stats.balance > 0 ? "gold" : "muted"}>
                <Count value={stats.balance} />
              </Figure>
              {moved ? (
                <dl className="flex flex-col gap-0.5 text-[13px] leading-5">
                  <PointsLine
                    label="за неделю"
                    spot={week}
                    change={week && week.delta !== 0 ? <Delta change={changeOf(week.points, week.points - week.delta)} good="up" title="к прошлой неделе" /> : null}
                  />
                  <PointsLine label="за месяц" spot={month} />
                </dl>
              ) : (
                <p className="text-[13px] leading-5 text-muted">За месяц новых очков нет</p>
              )}
              {week && week.points > 0 && stats.weekRows.length > 1 ? <RankStrip rows={stats.weekRows} personId={personId} /> : null}
            </>
          );
        }}
      </Body>
    </Tile>
  );
}

/** «за неделю +40 · 3-е место из 14 ↑ 12» — the points of a span and the place they give. */
function PointsLine({ label, spot, change }: { label: string; spot: RatingSpot | null; change?: ReactNode }) {
  const points = spot?.points ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-x-2">
      <dt className="text-muted">{label}</dt>
      {points === 0 ? (
        <dd className="text-muted">очков не было</dd>
      ) : (
        <>
          <dd className={`nums font-medium ${points > 0 ? "text-gold" : "text-text"}`}>{formatNum(points, { signed: true })}</dd>
          {points > 0 && spot ? (
            <dd className="text-muted">
              · {placeText(spot.rank)} из {spot.of}
            </dd>
          ) : null}
        </>
      )}
      {change ? <dd>{change}</dd> : null}
    </div>
  );
}

/** The week's rating as a row of dots, the leader on the left: where this person stands in the team. */
function RankStrip({ rows, personId }: { rows: PointsStats["weekRows"]; personId: string }) {
  const last = Math.max(...rows.map((row) => row.rank));
  const at = (rank: number) => (last > 1 ? ((rank - 1) / (last - 1)) * 100 : 0);
  const me = rows.find((row) => row.user_id === personId);
  return (
    <figure className="mt-auto pt-2">
      <div className="ps-strip relative h-4" aria-hidden>
        <span className="ps-strip-track" />
        {rows
          .filter((row) => row.user_id !== personId)
          .map((row, i) => (
            <span key={row.user_id} className="ps-strip-dot ps-rank-dot" style={{ left: `${at(row.rank)}%`, animationDelay: `${160 + Math.min(i, 24) * 18}ms` }} />
          ))}
        {me ? <span className="ps-strip-typical ps-rank-me" style={{ left: `${at(me.rank)}%` }} /> : null}
      </div>
      <figcaption className="mt-1 flex justify-between text-[11px] leading-4 text-muted">
        <span>1-е место</span>
        <span>рейтинг недели</span>
      </figcaption>
    </figure>
  );
}

/* ---- Отчёты: handed in, the run, the hours, five weeks of days ----------------------------------------- */

const DAY_WORD: Record<ReportDayState, string> = {
  submitted: "сдан",
  missed: "не сдан",
  pending: "ещё не сдан",
  away: "не на месте",
  off: "не нужен",
  future: "впереди",
};

function ReportsTile({ source, now, index, className }: { source: Source<ReportStats>; now: Date; index: number; className: string }) {
  return (
    <Tile tileKey="reports" icon={ClipboardCheck} label="Отчёты за день" index={index} className={className}>
      <Body source={source} what="отчёты" bones={<TileBones picture={72} />}>
        {(stats) => {
          const period = stats.period;
          const due = period ? period.submitted + period.missed : 0;
          return (
            <div className="@container flex flex-1 flex-col">
              <div className="flex flex-1 flex-col gap-4 @min-[400px]:flex-row @min-[400px]:items-stretch @min-[400px]:gap-8">
                <div className="flex min-w-0 flex-1 flex-col gap-2.5">
                  {due === 0 || !period ? (
                    <Quiet>За {PERIOD_DAYS} дней сдавать отчёты не требовалось</Quiet>
                  ) : (
                    <>
                      <Figure unit={`из ${due}`}>
                        <Count value={period.submitted} />
                      </Figure>
                      <p className="-mt-1 text-[13px] leading-5 text-muted">отчётов сдано за {PERIOD_DAYS} дней</p>
                      <PartsBar
                        parts={[
                          { key: "submitted", label: "сдано", value: period.submitted, tone: "ok" },
                          { key: "missed", label: "не сдано", value: period.missed, tone: "danger" },
                        ]}
                      />
                    </>
                  )}
                  <ul className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 text-[13px] leading-5">
                    {stats.streak > 0 ? <Fact icon={Flame} label="подряд" value={formatNum(stats.streak)} /> : null}
                    {period?.avg_hours ? <Fact icon={Timer} label="в день" value={hoursText(period.avg_hours)} /> : null}
                    {period?.avg_arrived ? <Fact icon={LogIn} label="приход" value={shortHm(period.avg_arrived)} /> : null}
                    {period?.avg_left ? <Fact icon={LogOut} label="уход" value={shortHm(period.avg_left)} /> : null}
                  </ul>
                </div>
                <Days calendar={stats.calendar} now={now} />
              </div>
            </div>
          );
        }}
      </Body>
    </Tile>
  );
}

function Fact({ icon: Glyph, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <li className="flex min-w-0 items-center gap-1.5 whitespace-nowrap">
      <Glyph aria-hidden size={13} strokeWidth={2} className="ps-icon shrink-0" />
      <span className="nums font-medium text-text">{value}</span>
      <span className="text-muted">{label}</span>
    </li>
  );
}

/** What a day of the calendar says when the pointer is on it. */
function dayLine(cell: ReportCell, now: Date): string {
  const name = dayName(cell.day, now);
  if (cell.state === "submitted" && cell.row?.arrived_at && cell.row.left_at) return `${name} — сдан, ${timeOf(cell.row.arrived_at)}–${timeOf(cell.row.left_at)}`;
  return `${name} — ${DAY_WORD[cell.state]}`;
}

/** Five weeks of days, Monday to Sunday: handed in green, missed red, nothing due quiet, today ringed. */
function Days({ calendar, now }: { calendar: ReportCell[][]; now: Date }) {
  const [hover, setHover] = useState<ReportCell | null>(null);
  const count = (state: ReportDayState) => calendar.flat().filter((cell) => cell.state === state).length;
  return (
    <figure className="flex shrink-0 flex-col gap-1.5" data-testid="person-stat-days">
      <div className="ps-days" role="img" aria-label={`Отчёты по дням, пять недель: сдано ${count("submitted")}, не сдано ${count("missed")}`}>
        {WEEKDAYS_SHORT_RU.map((day) => (
          <span key={day} aria-hidden className="ps-days-head">
            {day}
          </span>
        ))}
        {calendar.flat().map((cell, i) => (
          <span
            key={cell.day}
            aria-hidden
            className="ps-day"
            data-state={cell.state}
            data-today={cell.today ? "" : undefined}
            style={{ animationDelay: `${120 + i * 12}ms` }}
            onPointerEnter={() => setHover(cell)}
            onPointerLeave={() => setHover(null)}
          />
        ))}
      </div>
      <figcaption className="h-4 text-[11px] leading-4 text-muted" aria-live="polite">
        {hover ? (
          <span className="block max-w-[180px] truncate">{dayLine(hover, now)}</span>
        ) : (
          <span className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="ps-swatch" data-tone="ok" /> сдан
            </span>
            <span className="flex items-center gap-1">
              <span className="ps-swatch" data-tone="danger" /> не сдан
            </span>
            <span className="flex items-center gap-1">
              <span className="ps-swatch" data-tone="quiet" /> не нужен
            </span>
          </span>
        )}
      </figcaption>
    </figure>
  );
}
