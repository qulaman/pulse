"use client";

import { ConciergeBell } from "lucide-react";
import type { ReactNode } from "react";

import type { Ink } from "@/components/desk/today/home/look";
import type { Tone } from "@/components/desk/ui/tone";

import { HeroFacts, type HeroFact } from "../team/Hero";
import { PersonFace, SCENE_ICON } from "./look";
import type { Band, BandRing } from "./pult";

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

const RING_INK: Record<NonNullable<BandRing>, Ink | null> = { ok: "ok", work: "pen", door: "violet", away: null, wait: "sky", alarm: "pencil" };

/**
 * The band of the director's «Пульт» (D-175), in the language of «Команда»'s hero: the secretary's
 * face with the ring of what they are doing and the job's sign on it, one sentence and a line under
 * it; on a calm desk, the thirty days' facts on the right (the median, a zero quiet).
 */
export function PultBand({ band, facts }: { band: Band; facts: HeroFact[] | null }) {
  const Glyph = band.scene ? SCENE_ICON[band.scene] : null;
  return (
    <section className="pult-band" data-ring={band.ring ?? undefined} data-testid="desk-errands-hero">
      <span className="pult-band-face">
        {band.face ? (
          <PersonFace id={band.face.id} name={band.face.full_name} size={64} ring={band.ring ? RING_INK[band.ring] : null} away={band.ring === "away"} />
        ) : (
          <span aria-hidden className="pult-band-nobody">
            <ConciergeBell size={26} strokeWidth={2} />
          </span>
        )}
        {Glyph ? (
          <span aria-hidden className="pult-band-badge" data-scene={band.scene}>
            <Glyph size={14} strokeWidth={2.25} />
          </span>
        ) : null}
      </span>
      <div className="pult-band-words">
        <p className="pult-band-title" data-testid="hero-title">
          {band.title}
        </p>
        {band.sub ? <p className="pult-band-sub">{band.sub}</p> : null}
      </div>
      {facts ? <HeroFacts facts={facts} className="pult-band-facts" /> : null}
    </section>
  );
}

/** The band while the requests load: its height, nothing moves when they land. */
export function PultBandBone() {
  return (
    <section className="pult-band" aria-hidden>
      <span className="skeleton h-16 w-16 shrink-0 rounded-full bg-surface-2" />
      <span className="flex flex-col gap-2">
        <span className="skeleton h-[18px] w-[260px] rounded-[4px] bg-surface-2" />
        <span className="skeleton h-[13px] w-[180px] rounded-[4px] bg-surface-2" />
      </span>
    </section>
  );
}
