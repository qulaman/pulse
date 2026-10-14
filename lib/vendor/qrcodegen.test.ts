import { describe, expect, it } from "vitest";

import { Ecc, QrCode } from "./qrcodegen";

/** A finder pattern: 7×7 dark frame, light ring, dark 3×3 centre. */
function hasFinder(qr: QrCode, left: number, top: number): boolean {
  for (let dy = 0; dy < 7; dy++) {
    for (let dx = 0; dx < 7; dx++) {
      const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
      const dark = ring !== 2;
      if (qr.getModule(left + dx, top + dy) !== dark) return false;
    }
  }
  return true;
}

describe("vendored QR encoder (flattened from namespaces)", () => {
  it("draws a version that fits a sign-in link, with all three finders and the timing lines", () => {
    const qr = QrCode.encodeText("https://pulse-blond-one.vercel.app/c/alfa-group", Ecc.MEDIUM);
    expect((qr.size - 17) % 4).toBe(0);
    expect(qr.version).toBe((qr.size - 17) / 4);
    expect(qr.version).toBeLessThanOrEqual(4);
    expect(hasFinder(qr, 0, 0)).toBe(true);
    expect(hasFinder(qr, qr.size - 7, 0)).toBe(true);
    expect(hasFinder(qr, 0, qr.size - 7)).toBe(true);
    for (let i = 8; i < qr.size - 8; i++) {
      expect(qr.getModule(i, 6)).toBe(i % 2 === 0);
      expect(qr.getModule(6, i)).toBe(i % 2 === 0);
    }
    // the dark module next to the bottom-left finder (ISO 18004 §7.9)
    expect(qr.getModule(8, qr.size - 8)).toBe(true);
  });

  it("is deterministic and grows with the text", () => {
    const a = QrCode.encodeText("https://x.example/login", Ecc.MEDIUM);
    const b = QrCode.encodeText("https://x.example/login", Ecc.MEDIUM);
    expect(a.size).toBe(b.size);
    expect(a.mask).toBe(b.mask);
    const long = QrCode.encodeText("https://x.example/".padEnd(200, "a"), Ecc.MEDIUM);
    expect(long.size).toBeGreaterThan(a.size);
  });
});
