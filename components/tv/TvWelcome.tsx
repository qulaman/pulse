"use client";

import { StillLogo } from "@/components/ui/StillLogo";
import { tvDate, tvTime } from "@/lib/tv/clock";
import type { TvEventRow } from "@/lib/tv/queries";

import { TvMascot } from "./TvMascot";

/**
 * A guest in the office (D-185): the wall shows no working scenes — it greets on the company's behalf.
 * On the left of the grid the logo, «Добро пожаловать» and the name, under them the time and the date, large; bottom
 * right, a small calm mascot. No numbers, no service marks: a guest gets a reception, not a scoreboard. The frame
 * hides the channel mark on this scene; the company's name stands here on its own.
 */
export function TvWelcome({ company, logoUrl, now }: { company: string; logoUrl: string | null; now: Date; next: TvEventRow | null }) {
  return (
    <div
      className="grid h-full w-full grid-cols-[minmax(0,1fr)_auto] gap-x-[8vh] px-[var(--tv-x)] pb-[var(--tv-gap)] pt-[var(--tv-y)]"
      data-testid="tv-welcome"
    >
      <div className="flex min-w-0 flex-col justify-center">
        {logoUrl ? <StillLogo src={logoUrl} className="mb-[5vh] h-[14vh] w-auto self-start object-contain" /> : null}
        <p className="tv-lead" style={{ color: "var(--accent)" }}>
          Добро пожаловать
        </p>
        <p className="tv-title tv-two-lines mt-[1.4vh] [text-wrap:balance]" style={{ color: "var(--tv-text)" }}>
          {company}
        </p>

        <p className="tv-hero mt-[9vh]" style={{ color: "var(--tv-text)" }}>
          {tvTime(now)}
        </p>
        <p className="tv-lead mt-[2vh] text-muted first-letter:uppercase" style={{ fontWeight: 400 }}>
          {tvDate(now)}
        </p>
      </div>

      <div className="self-end pb-[4vh]">
        <TvMascot mood="calm" sizeVh={36} />
      </div>
    </div>
  );
}
