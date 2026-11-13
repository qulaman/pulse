"use client";

import { ArrowRight, Heart } from "lucide-react";
import { Fragment } from "react";

import { RollingNumber } from "@/components/ui/RollingNumber";
import { wallHm } from "@/lib/desk/busy";
import type { Errand } from "@/lib/errands/queries";
import { aqtobeDay, sceneOf, type DeskScene } from "@/lib/errands/scene";
import { doneSpanMinutes, median, spanWords } from "@/lib/errands/stats";
import type { SecretaryAction } from "@/lib/settings";

import { writeParams } from "../tasks/flow";
import { SceneTile } from "./look";

/*
 * «Сегодня» on «Стойка» (D-175): what SHE closed today — done and «не смогли», never a request the
 * director took back or a colleague's. A quiet desk reads it as a journal (time, what, what was
 * passed back, how long it took, ♥); a busy one as one tally line, so the queue keeps the room.
 */

export type DayClosed = {
  /** Hers, done or declined today, in the order they closed. */
  rows: Errand[];
  /** Done by scene, the most first. */
  byScene: { scene: DeskScene; count: number }[];
  declined: number;
  /** «попросили → готово», the median, minutes; null — nothing done yet. */
  medianMin: number | null;
  thanks: number;
};

const closedAt = (errand: Errand) => errand.done_at ?? errand.updated_at ?? errand.created_at;

export function dayClosedOf(rows: readonly Errand[], meId: string, now: Date, catalogue: readonly SecretaryAction[]): DayClosed {
  const today = aqtobeDay(now);
  const mine = rows
    .filter((e) => (e.status === "done" || e.status === "declined") && e.claimed_by === meId && aqtobeDay(new Date(closedAt(e))) === today)
    .sort((a, b) => closedAt(a).localeCompare(closedAt(b)));
  const counts = new Map<DeskScene, number>();
  for (const errand of mine) {
    if (errand.status !== "done") continue;
    const scene = sceneOf(errand, catalogue);
    counts.set(scene, (counts.get(scene) ?? 0) + 1);
  }
  return {
    rows: mine,
    byScene: [...counts.entries()].map(([scene, count]) => ({ scene, count })).sort((a, b) => b.count - a.count),
    declined: mine.filter((e) => e.status === "declined").length,
    // the same «обычно» as the director's «Пульт»: one median, one way of saying minutes (lib/errands/stats)
    medianMin: median(mine.map(doneSpanMinutes).filter((m): m is number => m !== null)),
    thanks: mine.filter((e) => e.thanked_at).length,
  };
}

/** A thank that came in the last few seconds pops as it lands; the rest stand still. */
const FRESH_THANK_MS = 10_000;

function Thanked({ errand, now }: { errand: Errand; now: Date }) {
  if (!errand.thanked_at) return <span aria-hidden className="stoika-heart-slot" />;
  // the screen's clock may lag the thank by up to its tick: a thank «from the future» is fresh too
  const fresh = now.getTime() - Date.parse(errand.thanked_at) < FRESH_THANK_MS;
  return (
    <span className="stoika-heart" data-fresh={fresh ? "" : undefined} title="Директор сказал «спасибо»">
      <Heart size={13} strokeWidth={2.5} fill="currentColor" aria-hidden />
      <span className="sr-only">спасибо</span>
    </span>
  );
}

function HistoryLink() {
  return (
    <button type="button" onClick={() => writeParams({ view: "history" })} className="stoika-link desk-focus" data-testid="desk-errands-all">
      История
      <ArrowRight size={14} strokeWidth={2.25} aria-hidden />
    </button>
  );
}

/** The quiet desk's journal: each request she closed today, on one line. */
export function DayJournal({ day, now, catalogue, openId, onOpen }: { day: DayClosed; now: Date; catalogue: readonly SecretaryAction[]; openId: string | null; onOpen: (id: string) => void }) {
  if (day.rows.length === 0) return null;
  return (
    <section className="stoika-card stoika-journal" data-testid="desk-errands-today" aria-label="Сегодня">
      <header className="stoika-card-head">
        <h2>Сегодня</h2>
        <span className="nums text-muted" data-tally-total>
          <RollingNumber value={day.rows.length} />
        </span>
        <span className="flex-1" />
        {day.medianMin !== null ? <span className="nums text-[13px] font-normal text-muted">обычно {spanWords(day.medianMin)} до «готово»</span> : null}
        <HistoryLink />
      </header>
      <ul className="stoika-journal-rows">
        {day.rows.map((errand) => {
          const took = doneSpanMinutes(errand);
          const declined = errand.status === "declined";
          return (
            <li key={errand.id}>
              <button type="button" className="stoika-journal-row desk-focus" aria-current={openId === errand.id ? "true" : undefined} onClick={() => onOpen(errand.id)} data-status={errand.status}>
                <span className="nums text-[12px] text-muted">{wallHm(closedAt(errand))}</span>
                <SceneTile scene={sceneOf(errand, catalogue)} size={26} muted={declined} />
                <span className="min-w-0 flex-1 truncate">
                  <b className="font-semibold">{errand.label}</b>
                  {errand.note ? <span className="text-muted"> · {errand.note}</span> : null}
                  {declined ? (
                    <span className="stoika-declined"> · не смогли{errand.decline_reason ? `: ${errand.decline_reason.charAt(0).toLowerCase()}${errand.decline_reason.slice(1)}` : ""}</span>
                  ) : errand.result ? (
                    <span className="text-muted"> · передали «{errand.result}»</span>
                  ) : null}
                </span>
                <span className="nums w-[64px] shrink-0 text-right text-[12px] text-muted">{took !== null ? spanWords(took) : ""}</span>
                <Thanked errand={errand} now={now} />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The busy desk's tally: «Сегодня 7 · [☕] 4 · [🍵] 2 · не смогли 1 · обычно 2 мин · ♥ 2 · История →». */
export function DayTally({ day }: { day: DayClosed }) {
  if (day.rows.length === 0) return null;
  const parts = [
    ...day.byScene.map((item) => (
      <span key={item.scene} className="stoika-tally-item" data-tally-scene={item.scene}>
        <SceneTile scene={item.scene} size={22} />
        <RollingNumber value={item.count} className="nums" />
      </span>
    )),
    day.declined > 0 ? (
      <span key="declined" className="stoika-tally-item text-muted">
        не смогли <span className="nums">{day.declined}</span>
      </span>
    ) : null,
    day.medianMin !== null ? (
      <span key="median" className="stoika-tally-item text-muted">
        обычно <span className="nums">{spanWords(day.medianMin)}</span>
      </span>
    ) : null,
    day.thanks > 0 ? (
      <span key="thanks" className="stoika-tally-item stoika-tally-thanks" title="Директор сказал «спасибо»">
        <Heart size={13} strokeWidth={2.5} fill="currentColor" aria-hidden />
        <span className="nums">{day.thanks}</span>
      </span>
    ) : null,
  ].filter(Boolean);
  return (
    <section className="stoika-card stoika-tally" data-testid="desk-errands-today" aria-label="Сегодня">
      <h2 className="stoika-tally-title">
        Сегодня
        <span className="nums text-muted" data-tally-total>
          <RollingNumber value={day.rows.length} />
        </span>
      </h2>
      <span className="stoika-tally-items">
        {parts.map((part, index) => (
          <Fragment key={index}>
            {index > 0 ? (
              <span aria-hidden className="text-muted">
                ·
              </span>
            ) : null}
            {part}
          </Fragment>
        ))}
      </span>
      <span className="flex-1" />
      <HistoryLink />
    </section>
  );
}

/**
 * «Готово»: the request's icon flies from its row into the tally (D-175 motion) — a copy of the
 * tile on top of the page, transform and opacity only; the count rolls once the list says so.
 * Nothing flies under «уменьшить движение» or when the tally is not on the screen.
 */
export function flyToToday(from: Element | null, scene: DeskScene) {
  if (!from || typeof window === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const target = document.querySelector(`[data-tally-scene="${scene}"]`) ?? document.querySelector("[data-tally-total]");
  if (!target) return;
  const a = from.getBoundingClientRect();
  const b = target.getBoundingClientRect();
  if (a.width === 0 || b.width === 0) return;
  const copy = from.cloneNode(true) as HTMLElement;
  copy.setAttribute("aria-hidden", "true");
  Object.assign(copy.style, {
    position: "fixed",
    left: `${a.left}px`,
    top: `${a.top}px`,
    width: `${a.width}px`,
    height: `${a.height}px`,
    margin: "0",
    zIndex: "70",
    pointerEvents: "none",
  });
  document.body.appendChild(copy);
  const dx = b.left + b.width / 2 - (a.left + a.width / 2);
  const dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const flight = copy.animate(
    [
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(0.85)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.5)`, opacity: 0 },
    ],
    { duration: 520, easing: "cubic-bezier(0.4, 0, 0.2, 1)" },
  );
  flight.onfinish = () => copy.remove();
  flight.oncancel = () => copy.remove();
}
