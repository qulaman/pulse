import type { Tone } from "@/components/desk/ui/tone";

const TONES: readonly Tone[] = ["accent", "ok", "warn", "danger", "muted", "gold"];

/**
 * The light of a screen's state on the desk (D-154) — the phone's sky (D-117) in a quiet register:
 * a 2 px line of the tone along the top of the screen and one soft glow behind the hero. A layer
 * per tone, the change is an opacity crossfade of 900 ms (none under `prefers-reduced-motion`).
 * Drawn at the top of `#desk-main` (it is `relative isolate`), under the content, never over it.
 */
export function DeskLight({ tone }: { tone: Tone | null | undefined }) {
  return (
    <div aria-hidden className="desk-light pointer-events-none absolute inset-x-0 top-0 -z-10 h-[300px] overflow-hidden" data-tone={tone ?? "none"}>
      {TONES.map((value) => (
        <div key={value} className="desk-light-layer absolute inset-0" data-on={tone === value ? "" : undefined} style={{ ["--light" as string]: `var(--${value === "muted" ? "text-muted" : value})` }} />
      ))}
    </div>
  );
}
