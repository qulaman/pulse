"use client";

import { shortName, useNamesKey } from "@/lib/people/names";
import { initialsOf } from "@/lib/people/queries";

/** A person in a table cell: initials in the brand circle and the name as the screen says it (D-146). */
export function PersonCell({ name, sub, muted = false }: { name: string | null | undefined; sub?: string | null; muted?: boolean }) {
  // re-reads the company's names, so «Ерлан» becomes «Ерлан Б.» once the roster has come
  useNamesKey();
  const full = name ?? "";
  return (
    <span className={`flex min-w-0 items-center gap-2 ${muted ? "opacity-55" : ""}`}>
      <span
        aria-hidden
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold text-bg"
        style={{ background: full ? "linear-gradient(135deg, var(--accent), var(--accent-2))" : "var(--surface-2)" }}
      >
        {full ? initialsOf(full) : "—"}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-[14px] leading-5" title={full || undefined}>
          {full ? shortName(full) : "Без исполнителя"}
        </span>
        {sub ? <span className="truncate text-[12px] leading-4 text-muted">{sub}</span> : null}
      </span>
    </span>
  );
}
