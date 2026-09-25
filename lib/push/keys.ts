/**
 * VAPID keys on the browser side (D-125). A subscription is bound to the server key it was
 * made with; a browser that subscribed under another key (a rotated pair, another deploy,
 * localhost with its own .env) gets `403` from the push service on every push, forever — the
 * secretary's phone on dev did exactly that. Pure, so vitest pins it.
 */

export function base64UrlToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}

/**
 * Was this subscription made with our key? `null` (a browser that does not tell) counts as
 * ours: re-subscribing on a guess would churn a working channel.
 */
export function madeWithKey(subscriptionKey: ArrayBuffer | null | undefined, publicKey: string): boolean {
  if (!subscriptionKey) return true;
  const ours = base64UrlToBytes(publicKey);
  const theirs = new Uint8Array(subscriptionKey);
  if (theirs.length !== ours.length) return false;
  for (let i = 0; i < ours.length; i += 1) {
    if (theirs[i] !== ours[i]) return false;
  }
  return true;
}
