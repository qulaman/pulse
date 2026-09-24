import Link from "next/link";

import { PulseMark } from "@/components/brand/PulseMark";
import { HeaderPoints } from "@/components/HeaderPoints";
import { HomeOnly } from "@/components/HomeOnly";
import { loadBrand } from "@/lib/brand";
import { firstNameOf } from "@/lib/text/normalize";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "•";
}

/**
 * The brand of the home screens (Пульс, Лента): the client's logo and name on the left when
 * the director set them (D-44), the product mark otherwise; who is signed in on the right —
 * a tap opens the profile; `pointsFor` adds that person's points under the name. Every other screen has its own navigation bar instead (D-113 §4),
 * so this bar shows on the home routes only. Clear, over the page's glow; the height is
 * the one the centred face was measured with (D-60, D-87 §7) — the border stays, transparent.
 */
export async function AppHeader({ fullName, companyId, pointsFor }: { fullName: string; companyId?: string; pointsFor?: string }) {
  const brand = await loadBrand(companyId);
  const branded = Boolean(brand.logoUrl) || brand.name !== "Pulse";

  return (
    <HomeOnly>
      <header
        className="border-b border-transparent px-4"
        style={{ paddingTop: "calc(8px + env(safe-area-inset-top))", paddingBottom: 8 }}
      >
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          {branded ? (
            <div className="flex min-w-0 items-center gap-2.5">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
                <img src={brand.logoUrl} alt="" className="h-7 max-w-[110px] shrink-0 object-contain" />
              ) : (
                <PulseMark />
              )}
              <span className="truncate font-display text-[17px] font-bold leading-[22px] tracking-[-0.02em]">{brand.name}</span>
            </div>
          ) : (
            <PulseMark />
          )}
          <Link href="/profile" aria-label="Профиль" className="flex min-w-0 shrink-0 items-center gap-2 transition-opacity duration-[120ms] active:opacity-60">
            {/* first name only: «Марат Оспанов» next to the client's name left «West Arla…» on a phone;
                the team sees its points under it — two lines still fit the avatar's 32 px */}
            <span className="flex min-w-0 flex-col items-end">
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
