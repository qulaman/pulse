import { PulseMark } from "@/components/brand/PulseMark";
import { loadBrand } from "@/lib/brand";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "•";
}

/**
 * Screen header: the client's logo and name on the left when the director set them
 * (D-44 — the one place the client brand lives), the product mark otherwise;
 * who is signed in on the right.
 */
export async function AppHeader({ fullName, companyId }: { fullName: string; companyId?: string }) {
  const brand = await loadBrand(companyId);
  const branded = Boolean(brand.logoUrl) || brand.name !== "Pulse";

  return (
    <header
      className="sticky top-0 z-10 border-b border-border bg-bg px-4"
      style={{ paddingTop: "calc(8px + env(safe-area-inset-top))", paddingBottom: 8 }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        {branded ? (
          <div className="flex min-w-0 items-center gap-2">
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
              <img src={brand.logoUrl} alt="" className="h-7 max-w-[110px] shrink-0 object-contain" />
            ) : (
              <PulseMark />
            )}
            <span className="truncate text-[16px] font-semibold leading-[22px]">{brand.name}</span>
          </div>
        ) : (
          <PulseMark />
        )}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          <span className="max-w-[140px] truncate text-[13px] leading-4 text-muted">{fullName}</span>
          <span
            aria-hidden
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold text-bg"
            style={{ background: "linear-gradient(135deg, var(--accent), #1FA88F)" }}
          >
            {initials(fullName)}
          </span>
        </div>
      </div>
    </header>
  );
}
