import Link from "next/link";
import type { ReactNode } from "react";

export type HeadIconName = "search" | "close" | "tv" | "plus" | "wall" | "more";

const STROKE = { fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

/** The icons of the head buttons: one stroke family, 20 px. */
export function HeadIcon({ name, size = 20 }: { name: HeadIconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden {...STROKE}>
      {name === "search" ? (
        <>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4-4" />
        </>
      ) : name === "close" ? (
        <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
      ) : name === "plus" ? (
        <path d="M12 5.5v13M5.5 12h13" strokeWidth={2.2} />
      ) : name === "more" ? (
        <g fill="currentColor" stroke="none">
          <circle cx="5.5" cy="12" r="1.7" />
          <circle cx="12" cy="12" r="1.7" />
          <circle cx="18.5" cy="12" r="1.7" />
        </g>
      ) : name === "tv" ? (
        <>
          {/* the screen fills faintly while something is on the wall (`.head-btn[data-live]`) */}
          <rect className="head-btn-screen" x="3" y="4.5" width="18" height="12" rx="2.2" />
          <path d="M9 20.5h6M12 16.5v4" />
        </>
      ) : (
        <>
          <rect className="head-btn-screen" x="3.5" y="4" width="17" height="12.5" rx="2" />
          <path d="M7.5 8.5h6M7.5 12h9M9 20.5h6M12 16.5v4" />
        </>
      )}
    </svg>
  );
}

/**
 * The round button of a screen head (D-109): search, «на стену», «+», «⋯». 42 px with a 44 px hit
 * area. `pressed` — a toggle that is on (the search is open); `live` — something is on the
 * office wall right now: the accent LED in the corner lights, like the diode of the remote
 * (D-76 §11); `tone="accent"` — the screen's main «create». Only transform on the press,
 * colours change without motion (DESIGN §2).
 */
export function HeadButton({
  label,
  icon,
  children,
  pressed,
  live,
  tone,
  href,
  onClick,
  disabled,
  testId,
}: {
  label: string;
  icon?: HeadIconName;
  children?: ReactNode;
  pressed?: boolean;
  live?: boolean;
  tone?: "accent";
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  testId?: string;
}) {
  const body = (
    <>
      {icon ? <HeadIcon name={icon} /> : children}
      <span aria-hidden className="head-btn-led" />
    </>
  );
  const data = {
    "data-tone": tone,
    "data-on": pressed || live ? "" : undefined,
    "data-live": live ? "" : undefined,
    "data-testid": testId,
  };
  if (href) {
    return (
      <Link href={href} aria-label={label} className="head-btn" {...data}>
        {body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed ?? live}
      disabled={disabled}
      onClick={onClick}
      className="head-btn"
      {...data}
    >
      {body}
    </button>
  );
}

/** The place of a head button in a skeleton: the same ring, nothing inside. */
export function HeadButtonBone() {
  return <span aria-hidden className="head-btn" />;
}
