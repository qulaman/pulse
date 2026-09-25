import { describe, expect, it } from "vitest";

import { base64UrlToBytes, madeWithKey } from "./keys";

// the shape of a real VAPID public key: 65 bytes, base64url without padding
const OURS = "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U";
const THEIRS = "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM";

describe("madeWithKey — a subscription under another VAPID key is dead (D-125)", () => {
  it("recognises its own key", () => {
    expect(madeWithKey(base64UrlToBytes(OURS).buffer, OURS)).toBe(true);
  });

  it("catches a subscription made with another key", () => {
    expect(madeWithKey(base64UrlToBytes(THEIRS).buffer, OURS)).toBe(false);
    expect(madeWithKey(new Uint8Array([4, 1, 2]).buffer, OURS)).toBe(false);
  });

  it("leaves alone a browser that does not say which key it used", () => {
    expect(madeWithKey(null, OURS)).toBe(true);
    expect(madeWithKey(undefined, OURS)).toBe(true);
  });

  it("decodes base64url with and without padding", () => {
    expect(base64UrlToBytes(OURS)).toHaveLength(65);
    expect(Array.from(base64UrlToBytes("-_8"))).toEqual([251, 255]);
  });
});
