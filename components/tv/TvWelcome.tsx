"use client";

import { StillLogo } from "@/components/ui/StillLogo";
import { tvDate, tvTime } from "@/lib/tv/clock";
import type { TvEventRow } from "@/lib/tv/queries";

import { TvMascot } from "./TvMascot";

/**
 * A guest in the office (D-185): the wall shows no working scenes — it shows whose office this is. The client's
 * logo, large, is the scene; a company without a logo has its name at tv-title instead. The time and the date
 * stand under it as the second thing, one quiet line; a small calm mascot sits in the corner. No greeting
 * phrase, no numbers, no service marks: a brand on the wall, not a hotel lobby and not a scoreboard. The frame
 * hides the channel mark and the band on this scene — the logo stands here on its own, and the scene takes the
 * band's height too: the logo is centred on the screen, the mascot sits in the safe frame's corner.
 */
export function TvWelcome({ company, logoUrl, now }: { company: string; logoUrl: string | null; now: Date; next: TvEventRow | null }) {
  return (
    <div
      className="tv-box absolute inset-x-0 top-0"
      // the band is off on the welcome (TvFrame): its strip is the scene's
      style={{ bottom: "calc(-1 * var(--tv-band))", height: "auto", paddingBottom: "var(--tv-y)" }}
      data-testid="tv-welcome"
    >
      <div className="tv-split min-h-0 flex-1">
        <div className="flex min-w-0 flex-col justify-center">
          {logoUrl ? (
            // the client's own colours, as large as the wall gives a brand: 20 % of the height, never past the column
            <StillLogo src={logoUrl} alt={company} className="h-[20vh] w-auto max-w-full self-start object-contain object-left" />
          ) : (
            <p className="tv-title tv-two-lines [text-wrap:balance]" style={{ color: "var(--tv-text)" }}>
              {company}
            </p>
          )}
          <p className="tv-body mt-[6vh] flex flex-wrap items-baseline gap-x-[3vh]">
            <span className="tv-num font-semibold" style={{ color: "color-mix(in srgb, var(--tv-text) 82%, transparent)" }}>
              {tvTime(now)}
            </span>
            <span className="text-muted first-letter:uppercase">{tvDate(now)}</span>
          </p>
        </div>

        <div className="flex min-w-0 flex-col items-end justify-end">
          <TvMascot mood="calm" sizeVh={16} />
        </div>
      </div>
    </div>
  );
}
