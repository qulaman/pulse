"use client";

import { haptic } from "@/lib/haptics";
import { useReactionPrices, useReactToTask, useTaskReactions } from "@/lib/points/game";
import { priceLabel, REACTION_CODES, REACTION_GLYPH, REACTION_LABEL, type ReactionCode } from "@/lib/points/reactions";

/**
 * The director's reaction to a task (D-133, И-68): seven faces in one row, the price under the
 * ones that pay (`settings.points_rules.reactions`). One reaction a task — a tap on another moves
 * it, a tap on the lit one takes it off; the points follow in the database. Never in the way:
 * nothing asks for it, the row can be left alone.
 */
export function ReactionBar({ taskId, pointsEnabled, className = "" }: { taskId: string; pointsEnabled: boolean; className?: string }) {
  const reactions = useTaskReactions();
  const prices = useReactionPrices();
  const react = useReactToTask();
  const current = reactions.data?.[taskId] ?? null;

  const press = (code: ReactionCode) => {
    haptic(12);
    react.mutate({ taskId, code: current === code ? null : code });
  };

  return (
    <div className={className} data-testid="reaction-bar">
      <div role="group" aria-label="Реакция на задачу" className="flex justify-between gap-1">
        {REACTION_CODES.map((code) => {
          const lit = current === code;
          const price = pointsEnabled ? priceLabel(prices[code]) : null;
          return (
            <button
              key={code}
              type="button"
              aria-pressed={lit}
              aria-label={`${REACTION_LABEL[code]}${price ? `, ${price} очков` : ""}`}
              data-reaction={code}
              onClick={() => press(code)}
              className="flex min-h-[48px] min-w-0 flex-1 flex-col items-center justify-center rounded-[12px] border transition-[transform,background-color,border-color] duration-[120ms] active:scale-[0.92]"
              style={{
                borderColor: lit ? "var(--gold)" : "transparent",
                background: lit ? "color-mix(in srgb, var(--gold) 14%, transparent)" : "color-mix(in srgb, var(--surface-2) 70%, transparent)",
              }}
            >
              <span className="text-[20px] leading-6" aria-hidden>
                {REACTION_GLYPH[code]}
              </span>
              <span
                className="nums h-3.5 text-[10px] font-semibold leading-[14px]"
                style={{ color: lit ? "var(--gold)" : "var(--text-muted)" }}
                aria-hidden
              >
                {price ?? ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * What the assignee sees (D-133): the director's reaction to their task, gold — «🔥 от директора»
 * with what it brought, when points are on.
 */
export function ReactionBadge({ code, points, className = "" }: { code: ReactionCode; points: number | null; className?: string }) {
  return (
    <span
      data-testid="reaction-badge"
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px] font-semibold leading-4 ${className}`}
      style={{
        color: "var(--gold)",
        borderColor: "color-mix(in srgb, var(--gold) 45%, transparent)",
        background: "color-mix(in srgb, var(--gold) 12%, transparent)",
      }}
    >
      <span aria-hidden className="text-[15px] leading-4">
        {REACTION_GLYPH[code]}
      </span>
      от директора
      {points && points > 0 ? <span className="nums">· +{points}</span> : null}
    </span>
  );
}
