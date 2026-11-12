import { Martian_Mono, Tektur } from "next/font/google";

/**
 * The executive device's two technical voices, both with a width axis and Cyrillic:
 * Tektur — figures, labels and headings (set condensed); Martian Mono — HUD readouts, times,
 * codes. Running Russian text stays in the app's Golos Text (`--font-body`) for legibility.
 */
export const cyDisplay = Tektur({
  subsets: ["latin", "cyrillic"],
  axes: ["wdth"],
  variable: "--font-cy-display",
  display: "swap",
});

export const cyMono = Martian_Mono({
  subsets: ["latin", "cyrillic"],
  axes: ["wdth"],
  variable: "--font-cy-mono",
  display: "swap",
});
