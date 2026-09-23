const CONSONANTS = "bdfgkmnprstvz";
const VOWELS = "aeiu";
const DIGITS = "23456789";

/** An integer in [0, n) from the platform's CSPRNG. */
function cryptoInt(n: number): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] % n;
}

/**
 * A first or reset password that can be read aloud and typed on a phone keyboard without
 * switching layouts: four latin syllables and two digits, «kazemuti47». No o/0, l/1 or i/1
 * pairs to mix up; about 29 bits — the person changes it in «Профиле» anyway.
 */
export function generatePassword(random: (n: number) => number = cryptoInt): string {
  let out = "";
  for (let i = 0; i < 4; i++) {
    out += CONSONANTS[random(CONSONANTS.length)] + VOWELS[random(VOWELS.length)];
  }
  return out + DIGITS[random(DIGITS.length)] + DIGITS[random(DIGITS.length)];
}

/** What goes to the person when the login is handed over by a message instead of in person. */
export function loginMessage({ name, email, password, url }: { name: string; email: string | null; password: string; url: string }): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return [
    `${first}, вход в приложение:`,
    url,
    email ? `Почта: ${email}` : null,
    `Пароль: ${password}`,
    "Пароль смени в «Профиле».",
  ]
    .filter(Boolean)
    .join("\n");
}
