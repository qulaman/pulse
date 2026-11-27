/**
 * Wordmark: the product's sign in the brand accent plus the product name. `sign` picks the sign:
 * `line` — the cardiomonitor line, `ring` — the mascot's mark, a dot in a ring, in the proportions
 * of the browser tab's icon (scripts/make-icons.ts, `TAB`): a line heavy enough to stand beside
 * the extrabold word.
 * The `tv` size is measured in `vh`, not px: the kiosk runs on anything from a 720p
 * panel to a 4K wall, and a px mark would shrink to a sticker on the big one.
 */
export function PulseMark({ size = "md", sign = "line" }: { size?: "md" | "lg" | "tv"; sign?: "line" | "ring" }) {
  const text =
    size === "tv" ? "text-[4vh] leading-[4.6vh]" : size === "lg" ? "text-[32px] leading-9" : "text-[19px] leading-6";
  const icon = size === "lg" ? 40 : 26;
  const ring = size === "lg" ? 32 : 20;
  return (
    <span className={`inline-flex items-center select-none ${size === "tv" ? "gap-[1vh]" : "gap-2"}`}>
      {sign === "ring" ? (
        <svg
          {...(size === "tv" ? {} : { width: ring, height: ring })}
          viewBox="0 0 24 24"
          aria-hidden
          className={size === "tv" ? "h-[3.4vh] w-[3.4vh] shrink-0" : "shrink-0"}
        >
          <circle cx="12" cy="12" r="8" fill="none" stroke="var(--accent)" strokeWidth="2.6" />
          <circle cx="12" cy="12" r="3.1" fill="var(--accent)" />
        </svg>
      ) : (
        <svg
          {...(size === "tv" ? {} : { width: icon, height: (icon * 18) / 26 })}
          viewBox="0 0 26 18"
          aria-hidden
          className={size === "tv" ? "h-[3.2vh] w-[4.6vh] shrink-0" : "shrink-0"}
        >
          <polyline
            points="0,10 6,10 9,3 13,15 16,8 19,10 26,10"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="2.4"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </svg>
      )}
      <span className={`${text} font-display font-extrabold tracking-[-0.03em] text-text`}>Pulse</span>
    </span>
  );
}
