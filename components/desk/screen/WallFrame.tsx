"use client";

import { LiveWall } from "@/components/screen/LiveWall";
import { Button } from "@/components/ui/Button";
import type { WallReceipt } from "@/lib/tv/remote";

/** The receipt's ink on the dark chin: answering — print, silent — a failure, nothing to say yet — quiet. */
const INK: Record<WallReceipt["tone"], string> = {
  ok: "var(--text)",
  warn: "var(--danger)",
  muted: "var(--text-muted)",
};

/**
 * The live preview of the wall (D-153, D-154): `/tv` itself (`LiveWall`, the same the phone's
 * remote opens from its display) scaled to the column, set in a flat dark bezel: the wall is a
 * television, not paper (D-158). The receipt on its chin is a line of words: plain while the kiosk
 * answers, red «не отвечает с 16:50» or «не показал за 15 с» once it has gone silent (D-76 §9,
 * D-182), its diode beside it in the same colour (D-174) — and then «Перезапустить» right there.
 * Steady, never blinking. Look only: the frame takes no clicks and no focus. A kiosk's warning
 * about itself (sound blocked, a screen let fall asleep) is a quiet line under the chin.
 */
export function WallFrame({
  receipt,
  label,
  health,
  onRestart,
}: {
  receipt: WallReceipt | null;
  label?: string | null;
  health?: string | null;
  onRestart?: () => void;
}) {
  return (
    <figure className="screen-bezel m-0 bg-bg p-2 pb-0" data-testid="desk-wall-frame">
      <LiveWall className="screen-glass" testId="desk-wall-preview" />
      <figcaption className="screen-chin flex h-9 items-center gap-2.5" data-testid="desk-wall-receipt" data-tone={receipt?.tone ?? "muted"}>
        {/* the diode: the receipt's colour, steady — a wall that went silent is red, never blinking */}
        <span aria-hidden className="screen-diode" />
        <span className={`text-[13px] font-medium leading-[18px] ${receipt?.restart ? "shrink-0" : "truncate"}`} style={{ color: INK[receipt?.tone ?? "muted"] }}>
          {receipt?.text ?? "Связываюсь со стеной…"}
        </span>
        {receipt?.tone === "warn" ? (
          // what to do, not only what broke (D-160): the wall is a browser on a TV
          <span className="truncate text-[12px] leading-4 text-muted" data-testid="desk-wall-help">
            Проверьте, что телевизор включён, а на нём открыт Pulse — страница «Стена»
          </span>
        ) : null}
        {receipt?.restart && onRestart ? (
          <Button size="sm" variant="secondary" className="ml-auto shrink-0" onClick={onRestart} data-testid="desk-wall-restart">
            Перезапустить
          </Button>
        ) : null}
        {/* the screen's name gives way to what to do while the wall is silent */}
        {label && !receipt?.restart ? <span className="ml-auto truncate pl-3 text-[12px] leading-4 text-muted">{label}</span> : null}
      </figcaption>
      {health ? (
        <p className="screen-chin-note pb-2 text-[12px] leading-4 text-warn" data-testid="desk-wall-health">
          {health}
        </p>
      ) : null}
    </figure>
  );
}
