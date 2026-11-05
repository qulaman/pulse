"use client";

import { useLayoutEffect, useState, type ReactNode } from "react";

import type { MenuItem } from "@/components/desk/ui/Menu";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { Load } from "@/lib/people/loads";
import type { Availability, Person, Role } from "@/lib/people/queries";
import { ROLE_LABEL } from "@/lib/people/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** Roles in the order of the role picker (TeamRoster), the wall last. */
export const ROLE_ORDER: Record<Role, number> = { director: 0, manager: 1, secretary: 2, shopkeeper: 3, employee: 4, tv: 9 };

/** Absence is not an alarm and not the director's move: a quiet word (D-158). */
export const AVAILABILITY_TONE: Record<Availability, Tone> = { active: "ok", vacation: "muted", sick: "muted" };

function normalise(s: string): string {
  return s.toLowerCase().replace(/ё/g, "е").trim();
}

/** Search by name, position, spoken alias or role — the phone roster's rule. */
export function matchesPerson(person: Person, query: string, phone?: string | null): boolean {
  const q = normalise(query);
  if (!q) return true;
  const hay = normalise([person.full_name, person.position ?? "", phone ?? "", ...person.aliases, ROLE_LABEL[person.role]].join(" "));
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

/** A menu without a separator at either end or two in a row. */
export function tidy(items: MenuItem[]): MenuItem[] {
  return items.filter((item, i) => item !== "separator" || (i > 0 && i < items.length - 1 && items[i - 1] !== "separator"));
}

/** «5 задач» — a count with its word. */
export function counted(n: number, forms: [string, string, string]): string {
  return `${n} ${pluralRu(n, forms)}`;
}

/**
 * A person's photo, square as in a personnel file (D-158). No photo, or one that does not load:
 * nothing — the name beside it says everything. `initials` — a form, where the neutral square shows
 * the place the photo will take.
 */
export function Face({ person, size = 28, initials = false }: { person: Pick<Person, "full_name" | "avatar_url">; size?: number; initials?: boolean }) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = person.avatar_url;
  if (!url || url === broken) return initials ? <Avatar name={person.full_name} size={size} /> : null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- a profile photo from the public bucket
    <img src={url} alt="" decoding="async" onError={() => setBroken(url)} className="shrink-0 rounded-[2px] object-cover" style={{ width: size, height: size }} />
  );
}

/** Something on a card did not load: said where the numbers would stand, not as a false zero. */
export function LoadFailed({ what, onRetry }: { what: string; onRetry: () => void }) {
  return (
    <p className="flex flex-wrap items-center gap-2 text-[13px] leading-5 text-muted" role="status" data-testid="desk-load-failed">
      Не смог загрузить {what}
      <button type="button" onClick={onRetry} className="font-medium text-text underline-offset-2 hover:underline" data-testid="desk-load-retry">
        Повторить
      </button>
    </p>
  );
}

/** A state in a word (D-158): print for the norm, the red pencil for a deviation; no dot beside it. */
export function StateWord({ tone, children, title }: { tone: Tone; children: ReactNode; title?: string }) {
  return (
    <span className="block min-w-0 truncate" title={title} style={tone === "ok" ? undefined : { color: TONE_VAR[tone] }}>
      {children}
    </span>
  );
}

/** «в отпуске» beside a name — said only when the person is not at work, quietly: absence is not an alarm. */
export function AwayTag({ availability }: { availability: Availability }) {
  if (availability === "active") return null;
  return (
    <span className="shrink-0 text-muted" data-testid="away-tag">
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
 * A person's open work as a tally, the way a ledger counts (D-158): a stroke a task — late in the
 * red pencil, in hand in grey print, handed in and waiting for the director in the pen. One pitch
 * for the whole team, so the busiest are seen at a glance; a heavy load closes the strokes up
 * rather than outgrow the column.
 */
export function LoadTally({ load, scale, width = 80 }: { load: Load | undefined; scale: number; width?: number }) {
  const overdue = load?.overdue ?? 0;
  const review = load?.review ?? 0;
  const working = Math.max(0, (load?.active ?? 0) - overdue - review);
  const pitch = Math.min(5, width / Math.max(scale, 1));
  const stroke = Math.max(1, Math.round(pitch * 0.4));
  const strokes = [...Array<string>(overdue).fill(TONE_VAR.danger), ...Array<string>(working).fill(TONE_VAR.muted), ...Array<string>(review).fill(TONE_VAR.warn)];
  return (
    <svg aria-hidden width={width} height={14} shapeRendering="crispEdges" className="shrink-0">
      {strokes.map((paint, index) => (
        <rect key={index} x={Math.round(index * pitch)} y={1} width={stroke} height={12} fill={paint} />
      ))}
    </svg>
  );
}

/** A section of a desk card: the desk's one section label over its lines (D-154, D-158). */
export function Block({ title, count, end, children, testId }: { title: string; count?: number; end?: ReactNode; children: ReactNode; testId?: string }) {
  return (
    <section className="flex flex-col gap-1.5" data-testid={testId}>
      <SectionLabel count={count} action={end}>
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

/** A desk table while its rows load: the head and 34-px rows, nothing moves when they come. */
export function GridBone({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  const widths = ["55%", "40%", "30%", "20%", "35%", "25%"];
  return (
    <SkeletonGroup grow className="desk-list">
      <div className="flex h-[27px] items-center gap-3">
        <Bone h={12} w={120} />
      </div>
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex h-[34px] items-center gap-6">
          {Array.from({ length: columns }, (_, c) => (
            <Bone key={c} h={14} w={widths[(r + c) % widths.length]} />
          ))}
        </div>
      ))}
    </SkeletonGroup>
  );
}
