/** Wordmark: the cardiomonitor line in the brand accent plus the product name. */
export function PulseMark({ size = "md" }: { size?: "md" | "lg" }) {
  const text = size === "lg" ? "text-[32px] leading-9" : "text-[19px] leading-6";
  const icon = size === "lg" ? 40 : 26;
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg
        width={icon}
        height={(icon * 18) / 26}
        viewBox="0 0 26 18"
        aria-hidden
        className="shrink-0"
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
