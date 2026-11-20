"use client";

import { DndLamp } from "@/components/secretary/DndLamp";
import { ErrandCards, ResultCard } from "@/components/secretary/ErrandCards";
import type { useSecretaryActs } from "@/components/secretary/useSecretaryActs";
import { Sheet } from "@/components/ui/Sheet";
import { ReceptionCards } from "@/components/visits/ReceptionCards";
import { MessageButton, VisitorButton } from "@/components/visits/VisitorButton";
import { askedDetails, AWAY_SPANS, awayUntil, deskLine, RESULTS, sceneOf, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";

import type { useSecretaryHome } from "./useSecretaryHome";

type SecretaryHome = ReturnType<typeof useSecretaryHome>;

/** A finished job is offered for a result this long after «Готово» (D-99). */
const RESULT_WINDOW_MS = 10 * 60_000;

/**
 * The top of the secretary's screen: the lamp of the director's door and the day's count — laid
 * over the screen, out of the flow, so the face keeps the very middle (D-87).
 */
export function SecretaryTop({ home, meId, now, showTally }: { home: SecretaryHome; meId: string; now: Date; showTally: boolean }) {
  const { guarded, tally } = home;
  if (!guarded && !showTally) return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-col items-center px-4" data-testid="secretary-top">
      {guarded ? (
        <DndLamp since={guarded.accepted_at ?? guarded.created_at} who={guarded.claimed_by !== meId ? shortName(guarded.claimed?.full_name ?? "") || null : null} now={now} />
      ) : null}
      {showTally ? (
        // what this secretary closed today, by button — the day's work at a glance
        <p className="nums max-w-full truncate pt-2 text-center text-[12px] leading-4 text-muted" data-testid="desk-tally">
          Сегодня:{" "}
          {tally.items.map((item) => (
            <span key={item.kind} className="ml-1">
              {item.icon || item.label} {item.count}
            </span>
          ))}
          {tally.averageMin !== null ? <span> · в среднем {tally.averageMin} мин</span> : null}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Right under the secretary's face: what it is doing in a few words (D-87, D-97), «на месте», what
 * a tap on the face does while a request rings, and a little lower «Посетитель» (D-96) and
 * «Сообщение» (D-116) — the secretary's own words on the director's wall.
 */
export function DeskUnder({ home, now, acceptByFace, act }: { home: SecretaryHome; now: Date; acceptByFace: boolean; act: ReturnType<typeof useSecretaryActs> }) {
  const { desk, urgency, showsGuest, streak, away, meAtDesk, visitRows } = home;
  const thanks = act === "thanks";
  return (
    <>
      <div className="-mt-1 flex max-w-full flex-col items-center gap-0.5">
        <p
          key={`${desk.phase}-${desk.errand?.id ?? ""}-${thanks ? "t" : ""}`}
          className="card-in max-w-full truncate rounded-full px-3 py-1 text-center text-[15px] font-medium leading-5"
          style={{
            background: "color-mix(in srgb, var(--surface) 88%, transparent)",
            color: thanks
              ? "var(--danger)"
              : desk.phase === "asked"
                ? urgency === 2
                  ? "var(--danger)"
                  : "var(--warn)"
                : desk.phase === "rest"
                  ? "var(--text-muted)"
                  : "var(--text)",
          }}
          data-testid="desk-line"
          data-phase={desk.phase}
          data-urgency={desk.phase === "asked" ? urgency : undefined}
        >
          {thanks ? "Директор: спасибо ♥" : showsGuest ? "Приглашаю посетителя в кабинет" : deskLine(desk)}
          {!thanks && desk.phase === "asked" && desk.errand?.note ? <span className="text-muted"> · {desk.errand.note}</span> : null}
          {streak >= 2 ? <span className="text-muted"> · {streak} подряд быстрее двух минут</span> : null}
        </p>
        <button
          type="button"
          onClick={() => home.setPresenceOpen(true)}
          className="mt-0.5 inline-flex min-h-[28px] items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-semibold leading-4"
          style={{
            borderColor: away ? "color-mix(in srgb, var(--warn) 55%, var(--border))" : "var(--border)",
            color: away ? "var(--warn)" : "var(--text-muted)",
          }}
          data-testid="presence-chip"
          data-away={away ? "1" : "0"}
        >
          <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: away ? "var(--warn)" : "var(--ok)" }} />
          {away && meAtDesk?.away_until ? `Не на месте ${untilLine(meAtDesk.away_until)}` : "На месте"}
        </button>
        {acceptByFace ? (
          <p className="text-[12px] leading-4 text-muted" data-testid="desk-hint">
            {[askedDetails(desk, now), "тап по лицу — принять"].filter(Boolean).join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <VisitorButton visits={visitRows} />
        <MessageButton visits={visitRows} />
      </div>
    </>
  );
}

/**
 * The secretary's requests live on the waiting screen itself: the reception's cards, the live
 * requests with «Принял» in one tap (D-87), and the latest finished job asking for its result.
 */
export function SecretaryCards({ home, meId, now }: { home: SecretaryHome; meId: string; now: Date }) {
  const { visitRows, mineErrands, errandRows, actions, skipped, setSkipped } = home;
  return (
    <>
      <ReceptionCards visits={visitRows} now={now} />
      {mineErrands.length > 0 ? (
        // «Не беспокоить» another secretary took is the lamp at the top of the screen (D-97)
        <div className="flex flex-col gap-2" data-testid="desk-cards">
          <ErrandCards errands={mineErrands} meId={meId} now={now} catalogue={actions} />
        </div>
      ) : null}
      {errandRows
        .filter(
          (e) =>
            e.status === "done" &&
            e.claimed_by === meId &&
            !e.result &&
            e.done_at &&
            now.getTime() - new Date(e.done_at).getTime() <= RESULT_WINDOW_MS &&
            !skipped.includes(e.id) &&
            RESULTS[sceneOf(e, actions)].length > 0,
        )
        .slice(0, 1)
        .map((e) => (
          <ResultCard key={e.id} errand={e} scene={sceneOf(e, actions)} onSkip={() => setSkipped((list) => [...list, e.id])} />
        ))}
    </>
  );
}

/** Stepped away (D-99): requests go to the secretaries who are here; nobody — they wait. */
export function PresenceSheet({ home }: { home: SecretaryHome }) {
  const { away, presenceOpen, setPresenceOpen, setAway } = home;
  return (
    <Sheet open={presenceOpen} onClose={() => setPresenceOpen(false)} title={away ? "Вы не на месте" : "Отойти"}>
      <div className="flex flex-col gap-2" data-testid="presence-sheet">
        {away ? (
          <button
            type="button"
            className="min-h-[52px] rounded-[16px] bg-accent text-[16px] font-semibold text-bg"
            onClick={() => {
              setAway.mutate(null);
              setPresenceOpen(false);
            }}
          >
            Я на месте
          </button>
        ) : null}
        {AWAY_SPANS.map((option) => (
          <button
            key={option.label}
            type="button"
            className="min-h-[48px] rounded-[16px] border border-border bg-surface-2/70 text-[15px] font-semibold"
            onClick={() => {
              // «до конца дня» — until 21:00 Aqtobe, the end of the delivery window (D-38)
              setAway.mutate(awayUntil(option.min));
              setPresenceOpen(false);
            }}
          >
            {option.label}
          </button>
        ))}
        <p className="px-1 text-[13px] leading-4 text-muted">Пока вас нет, просьбы директора уходят тем, кто на месте; если никого — ждут вас.</p>
      </div>
    </Sheet>
  );
}
