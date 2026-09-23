"use client";

import type { Orb, StarStage } from "@/lib/idle/people";

/** What each stage is called, in the assistant's own voice. */
const STAGE_TEXT: Record<StarStage, string> = {
  nova: "выдана, ещё не принял",
  work: "в работе",
  review: "сдана, ждёт приёмки",
  alarm: "нужен ты",
};

const STAGE_COLOR: Record<StarStage, string> = {
  nova: "var(--accent)",
  work: "var(--warn)",
  review: "var(--ok)",
  alarm: "var(--danger)",
};

/**
 * The card over a star (D-73): who it is and what of his the director is looking at. It reads
 * and nothing more — the whole point of the sky is that it costs no decisions, and a button
 * here would turn a glance into a task. The way in is the same as ever: the face, or the ball
 * of tasks after a tap on it.
 */
export function StarCard({ orb, onClose }: { orb: Orb; onClose: () => void }) {
  const shown = orb.load.tasks.slice(0, 3);
  const rest = orb.load.tasks.length - shown.length;
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label={`${orb.name}: ${orb.load.tasks.length} в работе. Закрыть`}
      data-testid="star-card"
      className="card-in pointer-events-auto block w-[min(84vw,272px)] rounded-[16px] border border-border bg-surface p-3 text-left"
      style={{ boxShadow: "var(--shadow-raised)" }}
    >
      <p className="text-[15px] font-semibold leading-5">{orb.name}</p>
      <ul className="mt-1.5 flex flex-col gap-1.5">
        {shown.map((task) => (
          <li key={task.id} className="relative pl-4 text-[14px] leading-[18px]">
            <span aria-hidden className="absolute left-0 top-[5px] h-2 w-2 rounded-full" style={{ background: STAGE_COLOR[task.stage] }} />
            <span className="block truncate">{task.title}</span>
            <span className="block text-[12px] leading-4 text-muted">{STAGE_TEXT[task.stage]}</span>
          </li>
        ))}
      </ul>
      {rest > 0 ? <p className="mt-1.5 pl-4 text-[12px] leading-4 text-muted">и ещё {rest}</p> : null}
    </button>
  );
}
