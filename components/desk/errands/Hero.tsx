"use client";

import type { ReactNode } from "react";

import type { Tone } from "@/components/desk/ui/tone";
import type { SecretaryPerson } from "@/lib/errands/queries";
import { isAway, untilLine } from "@/lib/errands/scene";
import { shortName } from "@/lib/people/names";

import { PersonFace } from "./look";

/**
 * The total of «Заявки» (D-174), a card lit from its corner as the desk's other totals: what is
 * going on at the secretary's desk, in one line and a line under it, the picture of it on the left
 * (the secretary's face for the director, the count for the secretary), the screen's own move on
 * the right and room under it. The words come first in the document: they are what it says.
 */
export function ErrandsHero({
  lead,
  title,
  sub,
  tone,
  aside,
  children,
}: {
  lead?: ReactNode;
  title: ReactNode;
  sub?: ReactNode;
  tone?: Tone | null;
  aside?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="desk-total errands-hero @container flex flex-col gap-3.5" data-testid="desk-errands-hero" data-tone={tone ?? undefined}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="errands-hero-words min-w-0 flex-1">
          <p className="text-[17px] font-semibold leading-[22px] [overflow-wrap:anywhere]" data-testid="hero-title">
            {title}
          </p>
          {sub ? <p className="mt-0.5 text-[13px] leading-[18px] text-muted">{sub}</p> : null}
        </div>
        {lead ? <div className="errands-hero-lead -order-1 shrink-0">{lead}</div> : null}
        {aside ? <div className="min-w-0 @min-[1040px]:ml-auto">{aside}</div> : null}
      </div>
      {children}
    </section>
  );
}

/**
 * Who is at the secretary's desk, for the director: their circles, the one at work ringed in green,
 * the one away dimmed with a dashed ring; a dot beside the first says there is somebody there.
 */
export function DeskFaces({ people, busyId, now }: { people: readonly SecretaryPerson[]; busyId: string | null; now: Date }) {
  if (people.length === 0) return null;
  const shown = people.slice(0, 3);
  const there = people.some((person) => !isAway(person, now));
  const title = people.map((person) => `${shortName(person.full_name)} — ${isAway(person, now) ? `не на месте ${untilLine(person.away_until as string)}` : "на месте"}`).join("\n");
  return (
    <span className="errands-desk-faces" title={title} data-there={there ? "" : undefined}>
      {shown.map((person) => (
        <PersonFace key={person.id} id={person.id} name={person.full_name} size={44} ring={person.id === busyId ? "ok" : null} away={isAway(person, now)} />
      ))}
      {there ? <span aria-hidden className="errands-presence" /> : null}
    </span>
  );
}
