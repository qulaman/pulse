"use client";

import {
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";

import { haptic } from "@/lib/haptics";

import s from "./device.module.css";

/**
 * The parts of a physical remote, as components. The page composes them; nothing here
 * knows about `tv_state`.
 *
 * Why hardware and not a settings list: the director holds this while looking away
 * from the wall. Keys that sink under the thumb, a lens that blinks while the command
 * travels and an LCD that states what is on the wall let the hand work without the eyes
 * — the same reason a real remote has no touchscreen.
 */

export function Body({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${s.body} ${className}`}>{children}</div>;
}

export type LedTone = "ok" | "warn" | "danger" | "muted" | "accent" | "off";

const LED_COLOR: Record<LedTone, string> = {
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
  accent: "var(--accent)",
  off: "rgba(255,255,255,.12)",
};

/** One LED. `blink` while a command is in flight — the only animation on the device. */
export function Led({ tone, blink = false, className = "" }: { tone: LedTone; blink?: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={[s.led, tone === "off" ? s.ledOff : "", blink ? s.blink : "", className].join(" ")}
      style={{ ["--led" as string]: LED_COLOR[tone] }}
    />
  );
}

/** The dark glass at the top with the receipt LED behind it. */
export function Lens({ tone, blink }: { tone: LedTone; blink?: boolean }) {
  return (
    <div className={s.lens}>
      <Led tone={tone} blink={blink} />
    </div>
  );
}

export function Lcd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`${s.lcd} ${className}`}>{children}</div>;
}

/** Text on the LCD that is not the headline: the eyebrow, the clock, a hint. */
export function LcdDim({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`${s.lcdDim} ${className}`}>{children}</span>;
}

/** How much of the focus is left, 0..1; scaleX only. */
export function Gauge({ ratio }: { ratio: number }) {
  return (
    <div className={s.gauge} aria-hidden>
      <div className={s.gaugeFill} style={{ transform: `scaleX(${Math.min(1, Math.max(0, ratio))})` }} />
    </div>
  );
}

type KeyProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "type"> & {
  /** Lit: this is the current state (the active scene, the current mode). */
  on?: boolean;
  round?: boolean;
  tall?: boolean;
  icon?: ReactNode;
};

/**
 * A rubber key. Press state is tracked by hand rather than with `:active`: iOS does not
 * apply `:active` to a button without a touch listener, and the haptic tick belongs to
 * the moment the face drops, not to the click that comes on release.
 */
export function Key({
  on = false,
  round = false,
  tall = false,
  icon,
  children,
  disabled,
  className = "",
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  ...rest
}: KeyProps) {
  const [pressed, setPressed] = useState(false);

  const down = (event: PointerEvent<HTMLButtonElement>) => {
    if (!disabled) {
      setPressed(true);
      haptic(10);
    }
    onPointerDown?.(event);
  };
  const up = (handler?: (event: PointerEvent<HTMLButtonElement>) => void) => (event: PointerEvent<HTMLButtonElement>) => {
    setPressed(false);
    handler?.(event);
  };
  const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === " " || event.key === "Enter") && !disabled) setPressed(true);
    onKeyDown?.(event);
  };
  const keyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    setPressed(false);
    onKeyUp?.(event);
  };

  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={on || undefined}
      data-pressed={pressed || undefined}
      className={[s.key, on ? s.keyOn : "", round ? s.round : "", tall ? s.tall : "", className].join(" ")}
      onPointerDown={down}
      onPointerUp={up(onPointerUp)}
      onPointerLeave={up(onPointerLeave)}
      onPointerCancel={up(onPointerCancel)}
      onKeyDown={keyDown}
      onKeyUp={keyUp}
      {...rest}
    >
      <span className={s.face}>
        {icon ? <span aria-hidden className="inline-flex">{icon}</span> : null}
        {children}
      </span>
    </button>
  );
}

/** The indicator under a key: lit when that key's state is the current one. */
export function Dot({ on }: { on: boolean }) {
  return <span aria-hidden className={`${s.dot} ${on ? s.dotOn : ""}`} />;
}

/**
 * A slide switch in a recessed panel. The whole row is the control: title, value and
 * knob toggle together, so the thumb does not have to find the 30px track.
 */
export function Switch({
  on,
  title,
  value,
  icon,
  disabled,
  onToggle,
}: {
  on: boolean;
  title: string;
  value: string;
  icon?: ReactNode;
  disabled?: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      className={s.panel}
      onPointerDown={() => {
        if (!disabled) haptic([8, 20, 8]);
      }}
      onClick={() => onToggle(!on)}
    >
      {icon ? (
        <span aria-hidden className="inline-flex shrink-0" style={{ color: on ? "var(--warn)" : "var(--text-muted)" }}>
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[15px] font-semibold leading-5 tracking-[-0.01em]">{title}</span>
        <span
          className="block truncate text-[13px] leading-4"
          style={{ color: on ? "var(--warn)" : "var(--text-muted)" }}
        >
          {value}
        </span>
      </span>
      <span aria-hidden className={`${s.track} ${on ? s.trackOn : ""}`}>
        <span className={s.knob} />
      </span>
    </button>
  );
}

/** A groove across the body and a label printed on it: the seam before the channel keys. */
export function Seam({ label }: { label: string }) {
  return (
    <>
      <div className={s.seam} aria-hidden />
      <p className={`${s.print} mt-3 px-1`}>{label}</p>
    </>
  );
}

/** The recessed search slot; the input is the caller's, the well is the body's. */
export function Slot({ children }: { children: ReactNode }) {
  return <label className={s.slot}>{children}</label>;
}

/** The keypad grid and the parts of a person key. */
export const padClass = s.pad;
export const personKeyClass = s.person;

export function Avatar({ initials }: { initials: string }) {
  return (
    <span aria-hidden className={s.avatar}>
      {initials}
    </span>
  );
}

export function PersonName({ children }: { children: ReactNode }) {
  return <span className={s.personName}>{children}</span>;
}
