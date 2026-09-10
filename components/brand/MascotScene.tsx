"use client";

import { Mascot } from "@/components/brand/Mascot";

export type Scene = "listening" | "saving" | "transcribing" | "parsing" | "sending";

const BARS = [0.55, 0.8, 1, 0.7, 0.9, 0.6, 0.45];
const STEPS: { key: Scene; label: string }[] = [
  { key: "saving", label: "Сохраняю" },
  { key: "transcribing", label: "Распознаю" },
  { key: "parsing", label: "Разбираю" },
];

/**
 * The mascot at work (D-43: the pipeline is visible). Three scenes, one character:
 * listening — an equaliser breathes with the voice; thinking — sparks orbit the
 * head while the step strip shows where the phrase is; sending — the card takes
 * off and the mascot is pleased. Everything is transform/opacity (DESIGN §2).
 */
export function MascotScene({ scene, level = 0 }: { scene: Scene; level?: number }) {
  if (scene === "listening") {
    const lvl = Math.min(1, Math.max(0, level));
    return (
      <div className="flex flex-col items-center">
        <Mascot state="listening" size={96} level={lvl} />
        <div className="mt-5 flex h-8 items-end gap-1" aria-hidden>
          {BARS.map((weight, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full"
              style={{
                height: 32,
                background: "var(--accent)",
                transformOrigin: "50% 100%",
                transform: `scaleY(${(0.12 + lvl * weight * 0.88).toFixed(3)})`,
                transition: "transform 70ms linear",
                animation: `eq-idle 1.1s ease-in-out ${i * 0.09}s infinite`,
                opacity: 0.55 + lvl * 0.45,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  if (scene === "sending") {
    return (
      <div className="relative flex flex-col items-center">
        {/* the card takes off along an arc and fades near the top */}
        <span
          aria-hidden
          className="absolute left-1/2 top-2 h-9 w-14 -translate-x-1/2 rounded-[8px] border border-accent/60 bg-surface"
          style={{ animation: "fly-card 1.2s cubic-bezier(0.2, 0.7, 0.3, 1) infinite" }}
        >
          <span className="mx-2 mt-2 block h-1 w-8 rounded bg-accent/70" />
          <span className="mx-2 mt-1 block h-1 w-5 rounded bg-border" />
        </span>
        <Mascot state="happy" size={96} />
      </div>
    );
  }

  // saving / transcribing / parsing: thinking with an orbit and the step strip
  const activeIndex = STEPS.findIndex((s) => s.key === scene);
  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <span
          aria-hidden
          className="absolute inset-[-14px]"
          style={{ animation: "orbit 2.4s linear infinite", transformOrigin: "50% 50%" }}
        >
          <span className="absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full" style={{ background: "var(--warn)" }} />
          <span className="absolute bottom-1 right-2 h-1.5 w-1.5 rounded-full" style={{ background: "var(--warn)", opacity: 0.6 }} />
        </span>
        <Mascot state="thinking" size={96} />
      </div>
      <ol className="mt-5 flex items-center gap-2 text-[13px] leading-4" aria-label="Этапы">
        {STEPS.map((step, i) => {
          const done = i < activeIndex;
          const active = i === activeIndex;
          return (
            <li key={step.key} className="flex items-center gap-2">
              <span
                className="flex h-5 w-5 items-center justify-center rounded-full text-[11px]"
                style={{
                  background: done ? "var(--ok)" : active ? "var(--warn)" : "var(--surface-2)",
                  color: done || active ? "var(--bg)" : "var(--text-muted)",
                  animation: active ? "mascot-breathe 1.2s ease-in-out infinite" : "none",
                }}
              >
                {done ? "✓" : i + 1}
              </span>
              <span style={{ color: active ? "var(--text)" : "var(--text-muted)" }}>{step.label}</span>
              {i < STEPS.length - 1 ? <span className="h-px w-4 bg-border" aria-hidden /> : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
