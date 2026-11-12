"use client";

import type { ReactNode } from "react";

import type { TvScene } from "@/lib/tv/state";

/** «По кругу» stands in the row of scenes as one more way the wall can look. */
export type SceneKey = TvScene | "round";

/**
 * A sketch of what each scene puts on the wall (D-174) — the TV's own dark and its pen, so the
 * card is read as a small screen: the face, the clock, the team's circles, today and the week,
 * the podium of the rating, the round of them all. 160 × 90, the wall's 16:9.
 */
const SKETCH: Record<SceneKey, ReactNode> = {
  face: (
    <>
      <circle cx="80" cy="42" r="21" fill="#2fbf71" />
      <ellipse cx="73" cy="40" rx="4.2" ry="5.4" fill="#0b0f14" />
      <ellipse cx="87" cy="40" rx="4.2" ry="5.4" fill="#0b0f14" />
      <rect x="62" y="72" width="36" height="4" rx="2" fill="#93a2b4" opacity="0.6" />
    </>
  ),
  clock: (
    <>
      <circle cx="80" cy="45" r="25" fill="none" stroke="#eef3f8" strokeWidth="2.5" opacity="0.85" />
      <path d="M80 45 L80 29" stroke="#eef3f8" strokeWidth="3" strokeLinecap="round" />
      <path d="M80 45 L92 52" stroke="#2ed3b7" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="80" cy="45" r="2.5" fill="#eef3f8" />
    </>
  ),
  team: (
    <>
      {[0, 1, 2, 3].map((col) =>
        [0, 1].map((row) => (
          <circle key={`${col}-${row}`} cx={44 + col * 24} cy={33 + row * 26} r="8.5" fill={col === 1 && row === 0 ? "#2ed3b7" : "#283548"} stroke={col === 1 && row === 0 ? "none" : "#93a2b4"} strokeOpacity="0.5" />
        )),
      )}
    </>
  ),
  calendar: (
    <>
      <rect x="22" y="18" width="40" height="54" rx="4" fill="#1b2533" />
      <rect x="28" y="26" width="18" height="4" rx="2" fill="#2ed3b7" />
      <rect x="28" y="36" width="28" height="3" rx="1.5" fill="#93a2b4" opacity="0.7" />
      <rect x="28" y="44" width="22" height="3" rx="1.5" fill="#93a2b4" opacity="0.5" />
      {[0, 1, 2, 3, 4, 5, 6].map((day) => (
        <rect key={day} x={70 + (day % 4) * 18} y={day < 4 ? 22 : 48} width="14" height="20" rx="2.5" fill={day === 2 ? "#2ed3b7" : "#1b2533"} opacity={day === 2 ? 0.9 : 1} />
      ))}
    </>
  ),
  rating: (
    <>
      <rect x="49" y="46" width="18" height="26" rx="2.5" fill="#93a2b4" opacity="0.55" />
      <rect x="71" y="30" width="18" height="42" rx="2.5" fill="#f0b24a" />
      <rect x="93" y="54" width="18" height="18" rx="2.5" fill="#b07a4a" opacity="0.8" />
      <circle cx="80" cy="21" r="5" fill="#f0b24a" />
    </>
  ),
  board: (
    <>
      {[0, 1, 2].map((line) => (
        <g key={line}>
          <circle cx="46" cy={28 + line * 17} r="5" fill={line === 0 ? "#2ed3b7" : "#283548"} />
          <rect x="58" y={26 + line * 17} width={line === 1 ? 44 : 58} height="4" rx="2" fill="#eef3f8" opacity={line === 0 ? 0.9 : 0.5} />
        </g>
      ))}
    </>
  ),
  round: (
    <>
      <path d="M58 40 A23 23 0 0 1 99 33" fill="none" stroke="#eef3f8" strokeWidth="2.5" strokeLinecap="round" opacity="0.85" />
      <path d="M95 26 L100 34 L91 36" fill="none" stroke="#eef3f8" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      <path d="M102 50 A23 23 0 0 1 61 57" fill="none" stroke="#2ed3b7" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M65 64 L60 56 L69 54" fill="none" stroke="#2ed3b7" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
};

/**
 * The scenes of the wall as cards (D-174): a small screen with the sketch of what the scene puts
 * up, its name and its key. The one the remote is set to is chosen (`value`, the ring); the one
 * the office sees this minute (`live`) carries «на стене» — in the round they are two different
 * cards. Tabs by role, as the segments they replace: a click puts the scene up (the caller sends
 * the command), the arrows only move the focus — a key never changes the wall by accident; the
 * digits stay the remote's own keys (DeskScreen).
 */
export function SceneCards({
  items,
  value,
  live,
  onPick,
}: {
  items: { value: SceneKey; label: string; hint: string }[];
  value: SceneKey;
  live: SceneKey | null;
  onPick: (value: SceneKey) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Заставка на стене"
      className="screen-scenes"
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
        const tabs = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")];
        const at = tabs.indexOf(document.activeElement as HTMLButtonElement);
        if (at < 0) return;
        event.preventDefault();
        event.stopPropagation();
        tabs[(at + (event.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length]?.focus();
      }}
    >
      {items.map((item, index) => {
        const chosen = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={chosen}
            tabIndex={chosen ? 0 : -1}
            data-testid={`seg-${item.value}`}
            data-live={item.value === live ? "" : undefined}
            onClick={() => onPick(item.value)}
            className="screen-scene"
            style={{ animationDelay: `${index * 35}ms` }}
          >
            <span aria-hidden className="screen-scene-shot">
              <svg viewBox="0 0 160 90" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
                {SKETCH[item.value]}
              </svg>
            </span>
            <span className="screen-scene-name">
              <span className="truncate">{item.label}</span> <kbd className="screen-scene-key">{item.hint}</kbd>
            </span>
          </button>
        );
      })}
    </div>
  );
}
