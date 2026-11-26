/**
 * The voices of the app (D-204): every sound is a list of notes — an oscillator or a burst of
 * filtered noise, a lowpass and an envelope — built in the browser by the Web Audio API. No audio
 * files. Which voice a moment plays is `CUES` in `lib/sound/index.ts`.
 *
 * The voices of the first block are the 24 free sounds of Bencho (https://bencho.dev/sounds),
 * copied as written; the `Note` shape is theirs too.
 *
 *   MIT License. Copyright (c) 2026 Lorenzo Cabra.
 *   «Beacon» and «Plop» are rebuilt from cuelume (https://cuelume.dev), MIT License,
 *   Copyright (c) 2026 Daniel Belyi.
 *
 *   Permission is hereby granted, free of charge, to any person obtaining a copy of this software
 *   and associated documentation files (the "Software"), to deal in the Software without
 *   restriction, including without limitation the rights to use, copy, modify, merge, publish,
 *   distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
 *   Software is furnished to do so, subject to the following conditions:
 *
 *   The above copyright notice and this permission notice shall be included in all copies or
 *   substantial portions of the Software.
 *
 *   THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 *   BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
 *   NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 *   DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *   OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 *
 * The second block is our own: the free set is mostly low thuds a phone's speaker does not carry,
 * so the voices of the phone's moments sit between 500 and 2500 Hz.
 */

export type Note = {
  /** Pitch, or the filter's corner for noise. */
  hz: number;
  /** Glide to this pitch. */
  to?: number;
  /** How long the glide takes, ms; the whole note when absent. */
  glide?: number;
  /** Length, ms. */
  ms: number;
  gain?: number;
  wave?: OscillatorType;
  /** Lowpass corner. */
  cut?: number;
  /** Start, ms after the sound's own start. */
  at?: number;
  /** Attack, ms. */
  atk?: number;
  noise?: "bandpass" | "lowpass";
  q?: number;
  /** A linear swell instead of an exponential one. */
  lin?: true;
};

export const VOICES = {
  // ---- Bencho, free set (MIT) ----------------------------------------------------------------
  paid: [
    { hz: 587, ms: 170, gain: 0.05, wave: "sine", cut: 2600, atk: 5 },
    { hz: 880, ms: 460, gain: 0.046, wave: "sine", cut: 2800, atk: 6, at: 95 },
    { hz: 1760, ms: 300, gain: 0.009, wave: "sine", atk: 8, at: 100 },
  ],
  landed: [
    { hz: 330, to: 620, ms: 120, gain: 0.018, wave: "triangle", cut: 1400, atk: 30 },
    { hz: 784, ms: 120, gain: 0.04, wave: "sine", cut: 2600, atk: 4, at: 70 },
    { hz: 1047, ms: 130, gain: 0.04, wave: "sine", cut: 2800, atk: 4, at: 140 },
    { hz: 1319, ms: 520, gain: 0.044, wave: "sine", cut: 3000, atk: 5, at: 210 },
    { hz: 2638, ms: 320, gain: 0.007, wave: "sine", atk: 8, at: 215 },
  ],
  plop: [
    { hz: 480, to: 300, glide: 18, ms: 23, gain: 0.064, atk: 1 },
    { hz: 600, to: 900, glide: 40, ms: 61, gain: 0.015, atk: 12 },
    { hz: 960, to: 600, glide: 18, ms: 18, gain: 0.016, atk: 1 },
  ],
  beacon: [
    { hz: 2500, ms: 5, gain: 0.029, noise: "lowpass", q: -3, atk: 1 },
    { hz: 880, ms: 602, gain: 0.026, atk: 3 },
    { hz: 2428.8, ms: 283, gain: 0.0077, atk: 3 },
    { hz: 4752, ms: 172, gain: 0.0026, atk: 3 },
    { hz: 882, ms: 573, gain: 0.014, atk: 3 },
    { hz: 1318.51, ms: 562, gain: 0.02, atk: 3 },
    { hz: 3639.1, ms: 264, gain: 0.0059, atk: 3 },
  ],
  drift: [{ hz: 174, to: 155, ms: 250, gain: 0.034, wave: "sine", cut: 640, atk: 28 }],
  hush: [{ hz: 330, to: 247, ms: 88, gain: 0.03, wave: "sine", cut: 720, atk: 8 }],
  wisp: [{ hz: 660, to: 720, ms: 38, gain: 0.028, wave: "sine" }],
  sigh: [{ hz: 262, to: 131, ms: 28, gain: 0.065, wave: "triangle", cut: 1700, atk: 8 }],
  perk: [{ hz: 330, ms: 360, gain: 0.053, wave: "sine", cut: 560, atk: 90 }],
  purr: [{ hz: 92, ms: 350, gain: 0.046, wave: "triangle", cut: 1100, atk: 32 }],
  lull: [{ hz: 234, ms: 214, gain: 0.054, wave: "sine", cut: 820, atk: 8 }],
  whisk: [{ hz: 124, to: 65, ms: 130, gain: 0.067, wave: "sine", cut: 560, atk: 50 }],
  buzz: [{ hz: 344, to: 239, ms: 24, gain: 0.048, wave: "triangle", cut: 1100, atk: 7 }],
  bump: [{ hz: 208, to: 165, ms: 120, gain: 0.03, wave: "sine", cut: 520, atk: 10 }],
  float: [{ hz: 262, ms: 322, gain: 0.052, wave: "sine", cut: 820, atk: 16 }],
  glide: [{ hz: 397, to: 276, ms: 205, gain: 0.065, wave: "sine", cut: 820, atk: 90 }],
  step: [{ hz: 227, to: 114, ms: 311, gain: 0.051, wave: "sine", cut: 820, atk: 90 }],
  wander: [{ hz: 315, ms: 326, gain: 0.061, wave: "sine", cut: 820, atk: 7 }],
  tick: [{ hz: 196, to: 130, ms: 150, gain: 0.07, wave: "sine", cut: 900 }],
  latch: [{ hz: 256, ms: 90, gain: 0.058, wave: "square", cut: 2400, atk: 10 }],
  hail: [{ hz: 392, ms: 360, gain: 0.051, wave: "sine", cut: 560, atk: 90 }],
  drape: [{ hz: 220, ms: 215, gain: 0.059, wave: "sine", cut: 560, atk: 8 }],
  boot: [{ hz: 291, ms: 360, gain: 0.043, wave: "sine", cut: 560, atk: 90 }],
  drone: [{ hz: 115, ms: 294, gain: 0.068, wave: "sine", cut: 560, atk: 72 }],

  // ---- ours ------------------------------------------------------------------------------------
  /** «Слушаю»: one short step up — over before the microphone has anything to keep. */
  listen: [{ hz: 620, to: 930, ms: 80, gain: 0.07, wave: "sine", atk: 5 }],
  /** «Принял»: two notes coming down. */
  heard: [
    { hz: 880, ms: 70, gain: 0.06, wave: "sine", atk: 4 },
    { hz: 660, ms: 130, gain: 0.06, wave: "sine", atk: 4, at: 60 },
  ],
  /** Sent: air and a note that leaves upward. */
  lift: [
    { hz: 900, to: 3200, ms: 170, gain: 0.035, noise: "bandpass", q: 1.2, atk: 40 },
    { hz: 523, to: 1047, glide: 150, ms: 240, gain: 0.06, wave: "sine", cut: 3000, atk: 12 },
  ],
  /** Sent, the other way: a fifth up. */
  sent: [
    { hz: 784, ms: 90, gain: 0.06, wave: "sine", atk: 4 },
    { hz: 1175, ms: 260, gain: 0.06, wave: "sine", atk: 5, at: 75 },
    { hz: 2350, ms: 180, gain: 0.01, wave: "sine", atk: 8, at: 80 },
  ],
  /** A nod: one warm note. */
  nod: [
    { hz: 659, ms: 150, gain: 0.07, wave: "sine", cut: 2600, atk: 5 },
    { hz: 1318, ms: 110, gain: 0.012, wave: "sine", atk: 6 },
  ],
  /** Closed: a major chord that rings out. */
  chord: [
    { hz: 523, ms: 520, gain: 0.04, wave: "sine", atk: 6 },
    { hz: 659, ms: 520, gain: 0.036, wave: "sine", atk: 6, at: 12 },
    { hz: 784, ms: 560, gain: 0.034, wave: "sine", atk: 6, at: 24 },
    { hz: 1568, ms: 300, gain: 0.008, wave: "sine", atk: 8, at: 30 },
  ],
  /** Points: three bright notes running up. */
  coins: [
    { hz: 1319, ms: 70, gain: 0.05, wave: "sine", atk: 3 },
    { hz: 1568, ms: 70, gain: 0.05, wave: "sine", atk: 3, at: 65 },
    { hz: 2093, ms: 260, gain: 0.05, wave: "sine", atk: 3, at: 130 },
    { hz: 4186, ms: 160, gain: 0.006, wave: "sine", atk: 6, at: 135 },
  ],
  /** A soft «нет»: two notes down, never an alarm. */
  nope: [
    { hz: 392, ms: 120, gain: 0.07, wave: "triangle", cut: 1800, atk: 6 },
    { hz: 294, ms: 220, gain: 0.07, wave: "triangle", cut: 1500, atk: 6, at: 115 },
  ],
  /** A step back: one note sliding down. */
  back: [{ hz: 740, to: 466, ms: 150, gain: 0.06, wave: "sine", cut: 2400, atk: 8 }],
  /** A mark put: a quick step up. */
  mark: [
    { hz: 988, ms: 55, gain: 0.05, wave: "sine", atk: 3 },
    { hz: 1319, ms: 130, gain: 0.05, wave: "sine", atk: 4, at: 45 },
  ],
  /** A key of the desk's pult: the click of the cap and the thump of its travel. */
  key: [
    { hz: 2600, ms: 14, gain: 0.05, noise: "bandpass", q: 1.5, atk: 1 },
    { hz: 210, to: 140, ms: 45, gain: 0.08, wave: "sine", cut: 900, atk: 2 },
    { hz: 1500, to: 1100, ms: 18, gain: 0.02, wave: "triangle", atk: 1 },
  ],
  /** Any button of the desk: a dry, quiet click. */
  tap: [
    { hz: 3200, ms: 9, gain: 0.022, noise: "bandpass", q: 2, atk: 1 },
    { hz: 1100, to: 800, ms: 16, gain: 0.02, wave: "sine", atk: 1 },
  ],
} satisfies Record<string, readonly Note[]>;

export type VoiceName = keyof typeof VOICES;

export const VOICE_NAMES = Object.keys(VOICES) as VoiceName[];

/** How long a voice sounds, ms: the end of its last note. */
export function voiceMs(notes: readonly Note[]): number {
  return notes.reduce((end, note) => Math.max(end, (note.at ?? 0) + note.ms), 0);
}
