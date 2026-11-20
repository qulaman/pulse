/**
 * celebrating: the confetti, each bit with where it lands and how far it turns on the way.
 * The spread is fixed, not random: a face that celebrates the same way every time is a
 * character, a random one is a particle effect. The assistant throws all ten; the secretary's
 * smaller face, the first eight (components/secretary/secretaryRoom.tsx).
 */
export const CONFETTI: ReadonlyArray<{ x: number; y: number; r: number; color: string; round?: boolean }> = [
  { x: -24, y: -10, r: 220, color: "var(--accent)" },
  { x: -15, y: -20, r: -160, color: "var(--gold)", round: true },
  { x: -6, y: -25, r: 300, color: "var(--ok)" },
  { x: 5, y: -26, r: -240, color: "#ffffff", round: true },
  { x: 14, y: -21, r: 200, color: "var(--accent)" },
  { x: 23, y: -12, r: -280, color: "var(--gold)" },
  { x: -30, y: 2, r: 180, color: "var(--ok)", round: true },
  { x: 30, y: 0, r: -200, color: "var(--warn)" },
  { x: -10, y: -14, r: 260, color: "var(--warn)", round: true },
  { x: 10, y: -12, r: -220, color: "var(--ok)" },
];
