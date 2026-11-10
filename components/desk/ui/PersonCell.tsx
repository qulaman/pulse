"use client";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { shortName, useNamesKey } from "@/lib/people/names";
import { initialsOf } from "@/lib/people/queries";

/**
 * A person in a desk cell: the name. On the sheet the initials are not drawn in a list (D-158): a
 * circle is a task's stage there, and the name says everything the initials do.
 */
export function PersonCell({
  name,
  sub,
  muted = false,
  ring,
  size = 28,
  gone = false,
}: {
  name: string | null | undefined;
  sub?: string | null;
  muted?: boolean;
  ring?: Tone | null;
  size?: number;
  /** The person left the team while the task is still open: nobody does it — the red pencil (D-160). */
  gone?: boolean;
}) {
  // re-reads the company's names, so «Ерлан» becomes «Ерлан Б.» once the roster has come
  useNamesKey();
  const full = name ?? "";
  return (
    <span className={`flex min-w-0 items-center gap-2.5 ${muted ? "opacity-55" : ""}`}>
      <Avatar name={full} ring={ring} size={size} />
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] leading-5" title={full || undefined}>
          {full ? shortName(full) : "Без исполнителя"}
        </span>
        {gone ? (
          <span className="truncate text-[12px] font-medium leading-4" style={{ color: TONE_VAR.danger }} title="Человек ушёл из команды — передайте задачу другому" data-testid="person-gone">
            ушёл
          </span>
        ) : sub ? (
          <span className="truncate text-[12px] leading-4 text-muted">{sub}</span>
        ) : null}
      </span>
    </span>
  );
}

/** The circle alone: neutral initials, the ring of a state when there is one. */
export function Avatar({ name, ring, size = 28 }: { name: string; ring?: Tone | null; size?: number }) {
  return (
    <span
      aria-hidden
      data-list={size < 40 ? "" : undefined}
      className="desk-avatar flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-display font-bold text-text/85"
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.38),
        boxShadow: ring ? `0 0 0 2px var(--bg), 0 0 0 4px ${TONE_VAR[ring]}` : "inset 0 0 0 1px var(--border)",
      }}
    >
      {name ? initialsOf(name) : "—"}
    </span>
  );
}
