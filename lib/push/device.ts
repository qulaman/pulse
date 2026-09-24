/**
 * A human name for a subscribed device (D-114): «iPhone · Safari», «Android · Chrome»,
 * «Windows · Edge». Shown in the director's device list and in the team's channel health;
 * a guess from the user agent, never a promise.
 */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone/i.test(ua)
    ? "iPhone"
    : /iPad/i.test(ua)
      ? "iPad"
      : /Android/i.test(ua)
        ? "Android"
        : /Windows/i.test(ua)
          ? "Windows"
          : /Mac OS X|Macintosh/i.test(ua)
            ? "Mac"
            : /Linux/i.test(ua)
              ? "Linux"
              : "";
  // order matters: Edge and Opera say «Chrome», Chrome says «Safari»
  const browser = /EdgA?\//.test(ua)
    ? "Edge"
    : /OPR\/|Opera/.test(ua)
      ? "Opera"
      : /YaBrowser/.test(ua)
        ? "Яндекс"
        : /SamsungBrowser/.test(ua)
          ? "Samsung"
          : /Firefox|FxiOS/.test(ua)
            ? "Firefox"
            : /Chrome|CriOS/.test(ua)
              ? "Chrome"
              : /Safari/.test(ua)
                ? "Safari"
                : "";
  if (os && browser) return `${os} · ${browser}`;
  return os || browser || "Устройство";
}
