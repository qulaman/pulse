import Link from "next/link";

import { PulseMark } from "@/components/brand/PulseMark";
import { HeaderPoints } from "@/components/HeaderPoints";
import { HomeOnly } from "@/components/HomeOnly";
import { StillLogo } from "@/components/ui/StillLogo";
import { loadBrand } from "@/lib/brand";
import { firstNameOf } from "@/lib/text/normalize";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "•";
}

/**
 * The brand of the home screens (Пульс, Лента): the client's logo on the left and its name in the
 * middle of the bar when the director set them (D-44), the product mark otherwise; who is signed
 * in on the right — a tap opens the profile; `pointsFor` adds that person's points under the name.
 * Every other screen has its own navigation bar instead (D-113 §4),
 * so this bar shows on the home routes only. Clear, over the page's glow; the height is
 * the one the centred face was measured with (D-60, D-87 §7) — the border stays, transparent.
 */
export async function AppHeader({ fullName, companyId, pointsFor }: { fullName: string; companyId: string; pointsFor?: string }) {
  const brand = await loadBrand(companyId);
  const branded = Boolean(brand.logoUrl) || brand.name !== "Pulse";

  return (
    <HomeOnly>
      <header
        className="border-b border-transparent px-4"
        style={{ paddingTop: "calc(8px + env(safe-area-inset-top))", paddingBottom: 8 }}
      >
        {/* three columns: the two sides share what the name leaves, so the name sits in the middle
            of the bar while both sides fit; on a narrow phone the wider side keeps its width and the
            name moves over a little rather than run into it */}
        <div className="mx-auto grid max-w-lg grid-cols-[1fr_auto_1fr] items-center gap-2">
          {/* the logo stands a little in from the edge and a little low; a transform, so the bar
              keeps the height the face was measured with */}
          <div className="ml-1.5 flex translate-y-[2px] justify-self-start">
            {brand.logoUrl ? <StillLogo src={brand.logoUrl} className="h-7 max-w-[110px] shrink-0 object-contain" /> : <PulseMark />}
          </div>
          {/* a long name takes a second line (on 360 px a three-word name did not fit one): two lines
              of 16 px are the avatar's 32 px — the bar keeps its height, nothing beside it moves */}
          {branded ? (
            <span className="line-clamp-2 break-words text-center font-display text-[15px] font-bold leading-4 tracking-[-0.02em]">{brand.name}</span>
          ) : (
            <span />
          )}
          {/* no min-w-0 here: the column keeps the width of the name and the points, so the grid gives
              them their room and never squeezes them under the brand's name */}
          <Link href="/profile" aria-label="Профиль" className="flex shrink-0 items-center gap-2 justify-self-end transition-opacity duration-[120ms] active:opacity-60">
            {/* first name only: «Марат Оспанов» next to the client's name left «West Arla…» on a phone;
                the team sees its points under it — two lines still fit the avatar's 32 px, and
                «925 очков» stays one line (nowrap), so the bar keeps its height */}
            <span className="flex min-w-0 flex-col items-end whitespace-nowrap">
              <span className="max-w-[110px] truncate text-[13px] leading-4 text-muted">{firstNameOf(fullName)}</span>
              {pointsFor ? <HeaderPoints userId={pointsFor} /> : null}
            </span>
            <span
              aria-hidden
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
            >
              {initials(fullName)}
            </span>
          </Link>
        </div>
      </header>
    </HomeOnly>
  );
}
