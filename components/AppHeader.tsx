import { PulseMark } from "@/components/brand/PulseMark";

function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return (first + second).toUpperCase() || "•";
}

/** Screen header: wordmark on the left, who is signed in on the right. */
export function AppHeader({ fullName }: { fullName: string }) {
  return (
    <header
      className="sticky top-0 z-10 border-b border-border bg-bg/90 px-4 backdrop-blur"
      style={{ paddingTop: "calc(8px + env(safe-area-inset-top))", paddingBottom: 8 }}
    >
      <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
        <PulseMark />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] leading-4 text-muted">{fullName}</span>
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
