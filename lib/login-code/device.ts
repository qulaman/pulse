const KEY = "pulse.device";

/**
 * A random id this browser keeps — the per-device limit on code attempts (D-135 §3). Nothing
 * about the person: a private window or cleared storage just gets a new one. Never throws.
 */
export function deviceId(): string | undefined {
  try {
    let id = window.localStorage.getItem(KEY);
    if (!id) {
      id = globalThis.crypto.randomUUID();
      window.localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return undefined;
  }
}

export type SignInPlace =
  /** an installed app or a computer: the code goes straight in */
  | "ready"
  /** iPhone/iPad in a browser tab: the home-screen app would not see this sign-in */
  | "ios-browser"
  /** a messenger's built-in browser: nothing can be installed from it */
  | "in-app";

/**
 * Where the code is about to be typed (D-135 §4). On iOS a home-screen app keeps its own
 * storage, apart from Safari: a sign-in in the tab stays in the tab — so the code waits until
 * the app is on the home screen. Android's Chrome and its installed app share one storage.
 */
export function signInPlace(): SignInPlace {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const ua = nav.userAgent;
  const standalone = window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  if (standalone) return "ready";
  if (/FBAN|FBAV|Instagram|Line\/|Telegram|WhatsApp|VKClient|OKApp|; wv\)/i.test(ua)) return "in-app";
  const ios = /iPhone|iPad|iPod/i.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  return ios ? "ios-browser" : "ready";
}
