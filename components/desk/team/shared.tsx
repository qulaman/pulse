"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { Load, LoadColor } from "@/lib/people/loads";
import type { Availability, Person, Role } from "@/lib/people/queries";
import { ROLE_LABEL } from "@/lib/people/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** Roles in the order of the role picker (TeamRoster), the wall last. */
export const ROLE_ORDER: Record<Role, number> = { director: 0, manager: 1, secretary: 2, shopkeeper: 3, employee: 4, tv: 9 };

export const AVAILABILITY_TONE: Record<Availability, Tone> = { active: "ok", vacation: "warn", sick: "warn" };

/** The tone of a person's load (D-118's crew circles): free says nothing, the rest is a state. */
export const LOAD_TONE: Record<LoadColor, Tone | null> = { gray: null, green: "ok", yellow: "warn", red: "danger" };

/**
 * The ring round a face (D-154): only a problem lights it — a deadline close or a task waiting for
 * the director (warn), an overdue one (danger). «All on time» stays neutral: on fifty people a
 * green ring on everyone with work is noise, not news.
 */
export const RING_TONE: Record<LoadColor, Tone | null> = { gray: null, green: null, yellow: "warn", red: "danger" };

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

/** «Сотрудник · Снабженец» — the role, and the position when it says more than the role. */
export function roleLine(person: Pick<Person, "role" | "position">): string {
  const position = person.position && person.position.toLowerCase() !== ROLE_LABEL[person.role].toLowerCase() ? person.position : null;
  return [ROLE_LABEL[person.role], position].filter(Boolean).join(" · ");
}

/** How the director addresses the person in an order: the first spoken form, else the first name (the phone card's rule). */
export function addressOf(person: Pick<Person, "aliases" | "full_name">): string {
  const dative = person.aliases[0] ?? person.full_name.split(/\s+/)[0] ?? person.full_name;
  return `${dative}, `;
}

/** «5 задач» — a count with its word. */
export function counted(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralRu(n, forms)}`;
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

/** «в отпуске» beside a name — said only when the person is not at work, quietly: absence is not an alarm. */
export function AwayTag({ availability }: { availability: Availability }) {
  if (availability === "active") return null;
  return (
    <span className="inline-flex h-5 shrink-0 items-center rounded-full border border-border bg-surface-2/70 px-2 text-[11px] font-semibold leading-none text-muted" data-testid="away-tag">
      {availability === "vacation" ? "в отпуске" : "на больничном"}
    </span>
  );
}

/** The load in words, for a title: «3 в работе · 1 просрочена · 1 на приёмке». */
export function loadWords(load: Load | undefined): string {
  if (!load || load.active === 0) return "открытых задач нет";
  const working = load.active - load.review;
  return [
    working > 0 ? `${working} в работе` : null,
    load.overdue > 0 ? `${load.overdue} ${pluralRu(load.overdue, ["просрочена", "просрочены", "просрочено"])}` : null,
    load.review > 0 ? `${load.review} на приёмке` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * A person's open work as one short bar (D-154): late, in hand, handed in — the stages of the
 * phone's ring laid flat, on a scale the whole team shares, so the busiest are seen at a glance.
 */
export function LoadBar({ load, scale, width = 80 }: { load: Load | undefined; scale: number; width?: number }) {
  const overdue = load?.overdue ?? 0;
  const review = load?.review ?? 0;
  const working = Math.max(0, (load?.active ?? 0) - overdue - review);
  const unit = width / Math.max(scale, 1);
  // in hand and on time is the norm: drawn quieter than the two exceptions
  const parts: { n: number; tone: Tone; paint: string }[] = [
    { n: overdue, tone: "danger", paint: TONE_VAR.danger },
    { n: working, tone: "ok", paint: "color-mix(in srgb, var(--ok) 55%, var(--surface-2))" },
    { n: review, tone: "warn", paint: TONE_VAR.warn },
  ];
  return (
    <span aria-hidden className="flex h-1.5 shrink-0 gap-px overflow-hidden rounded-full bg-surface-2" style={{ width }}>
      {parts.map((part) =>
        part.n > 0 ? <span key={part.tone} className="h-full shrink-0" style={{ width: Math.max(3, part.n * unit - 1), background: part.paint }} /> : null,
      )}
    </span>
  );
}

/** A section of a desk card: the desk's one section label over the block (D-154). */
export function Block({ title, count, end, children, testId }: { title: string; count?: number; end?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <SectionLabel count={count} action={end} className="px-1">
        {title}
      </SectionLabel>
      {children}
    </section>
  );
}

/**
 * The width of a box, followed as the window or the panel changes it; 0 until measured. A
 * callback ref: the box may come later than the screen (after its data has loaded). A table
 * drops its least needed columns under a width of its own, not of the window — the right-hand
 * panel takes 440 px of it.
 */
export function useBoxWidth(): [(node: HTMLDivElement | null) => void, number] {
  const [node, setNode] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, width];
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
