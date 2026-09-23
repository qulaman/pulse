/**
 * The idle scene is made up on the spot, but it has to be made up the same way twice: a smoke
 * run pins a seed and screenshots the very flight it saw last time, and a test can assert on a
 * drawing instead of on a random number. So everything random in the scene comes from here.
 */

/** mulberry32: small, fast, good enough for dust and for a wandering flight. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number in [min, max). */
export function between(random: () => number, min: number, max: number): number {
  return min + random() * (max - min);
}

/** One of the items, uniformly. */
export function pick<T>(random: () => number, items: readonly T[]): T {
  return items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
}

/** A seed that is different every time — for a scene nobody is going to compare to anything. */
export function looseSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}
