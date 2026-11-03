import type { Tone } from "@/lib/tasks/tone";

export type { Tone };

/** The token a tone paints with on the desk: the same six as the phone (lib/tasks/tone.ts). */
export const TONE_VAR: Record<Tone, string> = {
  accent: "var(--accent)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  danger: "var(--danger)",
  muted: "var(--text-muted)",
  gold: "var(--gold)",
};
