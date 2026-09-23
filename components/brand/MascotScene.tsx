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
 * The mascot at work (D-43: the pipeline is visible). One character, a different
 * choreography per stage — the Mascot itself carries the ear, the note, the text
 * lines, the cards and the throw; the scene adds only what lives outside the blob:
 * the equaliser of the voice and the step strip. The thrown card moved into the face
 * itself, so that every screen showing `sending` — the board included — throws something.
 * Everything is transform/opacity (DESIGN §2).
 */
export function MascotScene({ scene, level = 0 }: { scene: Scene; level?: number }) {
  if (scene === "listening") {
    const lvl = Math.min(1, Math.max(0, level));
    return (
      <div className="flex flex-col items-center">
        <Mascot state="listening" size={112} level={lvl} />
        <div className="mt-4 flex h-6 items-end gap-1" aria-hidden>
          {BARS.map((weight, i) => (
            <span
              key={i}
              className="w-1 rounded-full"
              style={{
                height: 24,
                background: "var(--accent)",
                transformOrigin: "50% 100%",
                transform: `scaleY(${(0.12 + lvl * weight * 0.88).toFixed(3)})`,
                transition: "transform 70ms linear",
                animation: `eq-idle 1.1s ease-in-out ${i * 0.09}s infinite`,
                opacity: 0.45 + lvl * 0.55,
              }}
            />
          ))}
        </div>
      </div>
    );
  }

  // saving / transcribing / parsing: the blob does the work, the strip says where the phrase is
  const activeIndex = STEPS.findIndex((s) => s.key === scene);
  return (
    <div className="flex flex-col items-center">
      <Mascot state={scene} size={112} />
      <ol className="mt-4 flex items-center gap-2 text-[13px] leading-4" aria-label="Этапы">
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
