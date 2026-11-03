"use client";

import type { ReactNode } from "react";

import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { Availability, Person, Role } from "@/lib/people/queries";
import { ROLE_LABEL } from "@/lib/people/queries";

/** Roles in the order of the role picker (TeamRoster), the wall last. */
export const ROLE_ORDER: Record<Role, number> = { director: 0, manager: 1, secretary: 2, shopkeeper: 3, employee: 4, tv: 9 };

export const AVAILABILITY_TONE: Record<Availability, Tone> = { active: "ok", vacation: "warn", sick: "warn" };

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

/** Search by name, position, spoken alias or role — the phone roster's rule. */
export function matchesPerson(person: Person, query: string): boolean {
  const q = normalise(query);
  if (!q) return true;
  const hay = normalise([person.full_name, person.position ?? "", ...person.aliases, ROLE_LABEL[person.role]].join(" "));
  return q.split(/\s+/).every((word) => hay.includes(word));
}

/** How the director addresses the person in an order: the first spoken form, else the first name (the phone card's rule). */
export function addressOf(person: Pick<Person, "aliases" | "full_name">): string {
  const dative = person.aliases[0] ?? person.full_name.split(/\s+/)[0] ?? person.full_name;
  return `${dative}, `;
}

/** A word with a dot in its tone — a state in a table cell. */
export function Dot({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={title}>
      <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: TONE_VAR[tone] }} />
      <span className="truncate" style={{ color: tone === "muted" ? "var(--text-muted)" : undefined }}>
        {children}
      </span>
    </span>
  );
}

/** A section of a desk card: the phone's eyebrow over the block. */
export function Block({ title, end, children, testId }: { title: string; end?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex min-h-6 items-center justify-between gap-3 px-1">
        <h2 className="eyebrow">{title}</h2>
        {end}
      </div>
      {children}
    </section>
  );
}

/** A desk table while its rows load: the head and 40-px rows, nothing moves when they come. */
export function GridBone({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  const widths = ["55%", "40%", "30%", "20%", "35%", "25%"];
  return (
    <SkeletonGroup grow className="overflow-hidden rounded-[12px] border border-border">
      <div className="flex h-9 items-center gap-3 border-b border-border bg-surface-2/60 px-3">
        <Bone h={12} w={120} />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-10 items-center gap-6 border-b border-border/50 px-3 last:border-b-0">
          {Array.from({ length: columns }, (_, c) => (
            <Bone key={c} h={14} w={widths[(r + c) % widths.length]} />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}
