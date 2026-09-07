/**
 * Deterministic text normalization shared by the STT gate, the guard and matchName.
 * Ported verbatim from tests/stt/run.mjs — behaviour must not drift, gate metrics depend on it.
 */

// Numeral words → digits so "в десять" == "в 10" (semantic, not orthographic, comparison).
export const NUMWORDS: Record<string, string> = {
  ноль: "0", один: "1", одна: "1", два: "2", две: "2", три: "3", четыре: "4", пять: "5",
  шесть: "6", семь: "7", восемь: "8", девять: "9", десять: "10", одиннадцать: "11", двенадцать: "12",
  пятнадцать: "15", двадцать: "20", тридцать: "30", сорок: "40", пятьдесят: "50", сто: "100",
};

export function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/[^a-zа-яәғқңөұүһі0-9\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((w) => NUMWORDS[w] ?? w)
    .join(" ");
}

// Russian + Kazakh case endings, longest first (STT_GATE.md §4).
export const ENDINGS: readonly string[] = [
  "ға", "ге", "қа", "ке", "ды", "ді", "ты", "ті", "ом", "ой", "ей", "у", "е", "а", "ы", "ю", "я",
];

const ENDINGS_SORTED = [...ENDINGS].sort((a, b) => b.length - a.length);

// Recursive: "Алияға" → "алия" → "али" must meet transcript's "алия" → "али".
export function stem(word: string): string {
  let s = word;
  let again = true;
  while (again && s.length > 3) {
    again = false;
    for (const e of ENDINGS_SORTED) {
      if (s.endsWith(e) && s.length - e.length >= 3) {
        s = s.slice(0, -e.length);
        again = true;
        break;
      }
    }
  }
  return s;
}

export function tokens(text: string): string[] {
  return normalize(text).split(" ").filter(Boolean);
}

export function stems(text: string): string[] {
  return tokens(text).map(stem);
}
