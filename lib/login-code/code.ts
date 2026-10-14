/**
 * The one-time sign-in code of D-135: eight digits, shown as «4829 1375». Digits, not letters —
 * a code is read out over the phone and typed on the numeric keypad. Eight, not six: the open
 * codes of every company share one pool (D-134), and a guess must stay hopeless.
 */
export const CODE_DIGITS = 8;

/** How long an issued code lives (D-135 §3): enough to hand it over in person or by a message. */
export const CODE_TTL_SECONDS = 15 * 60;

/** An integer in [0, n) from the platform's CSPRNG (Node and the browser alike). */
function cryptoInt(n: number): number {
  const buf = new Uint32Array(1);
  // rejection sampling keeps every digit equally likely
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  do globalThis.crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

export function generateCode(random: (n: number) => number = cryptoInt): string {
  let out = "";
  for (let i = 0; i < CODE_DIGITS; i++) out += String(random(10));
  return out;
}

/** The digits of what was typed or pasted («4829 1375», «4829-1375»); null unless exactly eight. */
export function normalizeCode(input: string): string | null {
  const digits = input.replace(/\D/g, "");
  return digits.length === CODE_DIGITS ? digits : null;
}

/** «48291375» → «4829 1375»; a partial entry is grouped the same way while it is typed. */
export function formatCode(digits: string): string {
  const clean = digits.replace(/\D/g, "").slice(0, CODE_DIGITS);
  return clean.length > 4 ? `${clean.slice(0, 4)} ${clean.slice(4)}` : clean;
}

/** What the issuer sends when the code goes by a message instead of in person. */
export function codeMessage({
  name,
  company,
  code,
  expiresAt,
  url,
}: {
  name: string;
  company: string;
  code: string;
  expiresAt: string;
  url: string;
}): string {
  const first = name.trim().split(/\s+/)[0] || name;
  const until = new Date(expiresAt).toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Aqtobe",
  });
  return [
    `${first}, вход в ${company}:`,
    url,
    `Код: ${formatCode(code)} — действует до ${until}.`,
    "Сначала приложение — на главный экран телефона, потом код в нём.",
  ].join("\n");
}

/** A short name of the device from its user agent — what the card shows after a sign-in. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone|iPod/i.test(ua)) return "iPhone";
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? "Android" : "Android-планшет";
  if (/SmartTV|SMART-TV|Tizen|Web0S|webOS|AFT[A-Z]|BRAVIA|HbbTV/i.test(ua)) return "телевизор";
  if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) return "компьютер";
  return "устройство";
}
