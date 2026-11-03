"use client";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { shortName, useNamesKey } from "@/lib/people/names";
import { initialsOf } from "@/lib/people/queries";

/**
 * A person in a desk cell (D-154): initials in a neutral circle, and around it — when given — a
 * 2 px ring in the tone of the person's most urgent task, the waiting screen's crew circles in
 * small (D-118). The accent is the director's own action, never a decoration on every face.
 */
export function PersonCell({
  name,
  sub,
  muted = false,
  ring,
  size = 28,
}: {
  name: string | null | undefined;
  sub?: string | null;
  muted?: boolean;
  ring?: Tone | null;
  size?: number;
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
        {sub ? <span className="truncate text-[12px] leading-4 text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

/** The circle alone: neutral initials, the ring of a state when there is one. */
export function Avatar({ name, ring, size = 28 }: { name: string; ring?: Tone | null; size?: number }) {
  return (
    <span
      aria-hidden
      className="flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-display font-bold text-text/85"
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
