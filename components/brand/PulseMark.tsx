/**
 * Wordmark: the cardiomonitor line in the brand accent plus the product name.
 * The `tv` size is measured in `vh`, not px: the kiosk runs on anything from a 720p
 * panel to a 4K wall, and a px mark would shrink to a sticker on the big one.
 */
export function PulseMark({ size = "md" }: { size?: "md" | "lg" | "tv" }) {
  const text =
    size === "tv" ? "text-[4vh] leading-[4.6vh]" : size === "lg" ? "text-[32px] leading-9" : "text-[19px] leading-6";
  const icon = size === "lg" ? 40 : 26;
  return (
    <span className={`inline-flex items-center select-none ${size === "tv" ? "gap-[1vh]" : "gap-2"}`}>
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
      <span className={`${text} font-display font-extrabold tracking-[-0.03em] text-text`}>Pulse</span>
    </span>
  );
}
