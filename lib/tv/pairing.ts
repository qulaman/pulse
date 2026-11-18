/**
 * A wall joins its company without a keyboard (D-182): the TV opens `/tv-connect` and shows six
 * digits, the director types them on the remote («Подключить экран»), and the TV's next poll gets
 * the session of the company's kiosk user. The TV never learns which company it asks for: the
 * director's confirmation names it.
 *
 * The sixth digit is a Damm check digit over the first five: every single wrong digit and every
 * swap of two neighbours is caught on the phone before anything is sent, so a slip of the finger
 * never lands on another screen's live code (D-182: a typo must not connect a stranger's TV).
 * Pure module — the server routes, the wall and the remote share it.
 */

/** Digits on the wall: five random ones and the check digit. */
export const PAIR_DIGITS = 6;

/** How long a code on the wall lives; then the wall shows a new one by itself. */
export const PAIR_TTL_SECONDS = 10 * 60;

/** How often the wall asks whether the director has confirmed. */
export const PAIR_POLL_MS = 3_000;

/** The director's misses before the remote waits (counted by `tv_pair_confirm`). */
export const CONFIRM_MISSES = 5;
export const CONFIRM_WINDOW_MINUTES = 10;

// Damm's quasigroup of order 10 (weakly totally anti-symmetric): one wrong digit or one swap of
// neighbours always changes the check.
const DAMM: readonly (readonly number[])[] = [
  [0, 3, 1, 7, 5, 9, 8, 6, 4, 2],
  [7, 0, 9, 2, 1, 5, 4, 8, 6, 3],
  [4, 2, 0, 6, 8, 7, 1, 3, 5, 9],
  [1, 7, 5, 0, 9, 8, 3, 4, 2, 6],
  [6, 1, 2, 3, 0, 4, 5, 9, 7, 8],
  [3, 6, 7, 4, 2, 0, 9, 5, 8, 1],
  [5, 8, 6, 9, 7, 2, 0, 1, 3, 4],
  [8, 9, 4, 5, 3, 6, 2, 0, 1, 7],
  [9, 4, 3, 8, 6, 1, 7, 2, 0, 5],
  [2, 5, 8, 1, 4, 3, 6, 7, 9, 0],
];

/** The Damm check digit of a string of digits («572» → 4). */
export function dammDigit(digits: string): number {
  let interim = 0;
  for (const ch of digits) interim = DAMM[interim][ch.charCodeAt(0) - 48];
  return interim;
}

/** An integer in [0, n) from the platform's CSPRNG (Node and the browser alike). */
function cryptoInt(n: number): number {
  const buf = new Uint32Array(1);
  // rejection sampling keeps every digit equally likely
  const limit = Math.floor(0x1_0000_0000 / n) * n;
  do globalThis.crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % n;
}

/** A fresh code for the wall: five random digits and their check digit. */
export function generatePairCode(random: (n: number) => number = cryptoInt): string {
  let body = "";
  for (let i = 0; i < PAIR_DIGITS - 1; i++) body += String(random(10));
  return body + String(dammDigit(body));
}

export type PairCodeRead =
  /** fewer than six digits so far */
  | { state: "short"; digits: string }
  /** six digits that cannot be a code: a digit is wrong or two are swapped */
  | { state: "typo"; digits: string }
  | { state: "ok"; digits: string };

/** What was typed or pasted («482 913», «482-913») — the digits and whether they can be a code. */
export function readPairCode(input: string): PairCodeRead {
  const digits = input.replace(/\D/g, "").slice(0, PAIR_DIGITS);
  if (digits.length < PAIR_DIGITS) return { state: "short", digits };
  return { state: dammDigit(digits) === 0 ? "ok" : "typo", digits };
}

/** «482913» → «482 913»; a partial entry is grouped the same way while it is typed. */
export function formatPairCode(input: string): string {
  const digits = input.replace(/\D/g, "").slice(0, PAIR_DIGITS);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

/** Whole minutes to wait, never «0 мин». */
export function waitMinutes(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** The wall's line under the code: how long it stands. A new one comes by itself. */
export function pairTimeLeft(ms: number): string {
  if (ms > 60_000) return `Код действует ещё ${Math.ceil(ms / 60_000)} мин`;
  return "Код вот-вот сменится — новый появится сам";
}

/** What the wall says instead of a code. */
export const WALL_TEXT = {
  ask: "Откройте на телефоне Пульт → «Подключить экран» и введите код",
  connecting: "Подключаю экран…",
  loading: "Готовлю код…",
  offline: "Нет связи — код появится, когда сеть вернётся",
  failed: "Сервер не ответил — пробую ещё раз",
  busy: (seconds: number) => `С этого адреса слишком много кодов — новый через ${waitMinutes(seconds)} мин`,
} as const;

/** Why the remote did not connect a screen: the server's codes plus the phone's own. */
export type PairError =
  | "bad_code"
  | "typo"
  | "too_many"
  | "no_screen"
  | "which_screen"
  | "offline"
  | "forbidden"
  | "failed";

/** The remote's words for a failed connection. */
export function confirmError(error: PairError, retryAfterSeconds?: number): string {
  switch (error) {
    case "bad_code":
      return "Код не подошёл или истёк";
    case "typo":
      return "В коде опечатка — сверьте цифры с экраном";
    case "too_many":
      return `Слишком много попыток — подождите ${waitMinutes(retryAfterSeconds ?? CONFIRM_WINDOW_MINUTES * 60)} мин`;
    case "no_screen":
      return "Экрана нет среди сотрудников: «Настройки» → «Сотрудники» → «Новый сотрудник», роль «ТВ-экран». Потом — сюда.";
    case "which_screen":
      return "Выберите, какой экран подключить";
    case "offline":
      return "Нет связи, экран не подключён";
    case "forbidden":
      return "Экран подключает директор";
    default:
      return "Не получилось подключить — можно ещё раз";
  }
}

/** A server's error code as one the remote knows; anything else is a plain failure. */
export function pairErrorOf(code: string | null | undefined): PairError {
  switch (code) {
    case "bad_code":
    case "typo":
    case "too_many":
    case "no_screen":
    case "which_screen":
    case "forbidden":
      return code;
    default:
      return "failed";
  }
}
