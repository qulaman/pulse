/**
 * Сколько строк займёт текст на стене — эвристика без DOM (D-121). Раскладке доски нужно
 * знать высоту пункта заранее: одна колонка или две, где кончается страница, влезает ли
 * карта. Мерить в браузере нельзя — раскладка чистая и тестируется, а стена не должна
 * прыгать после первого кадра.
 *
 * Ширины знаков — в долях кегля, замерены на Golos Text 600 (пункты) и Manrope 700
 * (название) в Chrome: средняя кириллица ≈ 0.53 em. Оценка намеренно чуть с запасом: лишняя
 * строка в расчёте стоит немного воздуха, недостающая — обрезанного пункта.
 */

/** Ширина знака в долях кегля. */
function glyphEm(ch: string): number {
  if (ch === " " || ch === " ") return 0.26;
  if ("жшщюмыЖШЩЮМЫWMmw@%".includes(ch)) return 0.78;
  if ("—".includes(ch)) return 0.82;
  // the arrow of «→ Марат» is a long one in Golos Text: 1.09 em
  if (ch === "→") return 1.09;
  if ("«»–-()[]/\\".includes(ch)) return 0.42;
  if (".,:;!?'\"·|ійl".includes(ch)) return 0.3;
  if (ch >= "0" && ch <= "9") return 0.6;
  if (ch !== ch.toLowerCase()) return 0.68;
  return 0.55;
}

/** Ширина строки в кеглях (em). */
export function emWidth(text: string): number {
  let sum = 0;
  for (const ch of text) sum += glyphEm(ch);
  return sum;
}

/**
 * Число строк при жадном переносе по пробелам в колонке шириной `widthEm` кеглей. Слово
 * длиннее строки рвётся где угодно (`overflow-wrap: anywhere` в вёрстке). Переносы после
 * дефиса и тире браузер делает тоже — здесь их нет, оценка только завышает. Неразрывный
 * пробел («→ Марат») не переносится — он часть слова.
 */
export function wrapLines(text: string, widthEm: number): number {
  const words = text.trim().split(/[^\S ]+/).filter(Boolean);
  if (words.length === 0) return 1;
  if (widthEm <= 0) return words.length;
  const space = glyphEm(" ");
  let lines = 1;
  let used = 0;
  for (const word of words) {
    let w = emWidth(word);
    if (used > 0 && used + space + w <= widthEm) {
      used += space + w;
      continue;
    }
    if (used > 0) {
      lines += 1;
      used = 0;
    }
    // a word longer than the line breaks anywhere
    while (w > widthEm) {
      lines += 1;
      w -= widthEm;
    }
    used = w;
  }
  return lines;
}

/**
 * Запас на гарнитуру: во сколько раз настоящая строка шире оценки. Подобран по замеру в
 * Chrome (855 строк, три гарнитуры, ширины 20–150 vh): с ним оценка не занижает ни одной
 * строки на ширинах стены, завышает — на одну в каждом десятом случае.
 */
export const FACE = {
  /** Пункт: Golos Text 600, трекинг −0.015em. */
  point: 1.07,
  /** Подпункт и лист карты: Golos Text 500. */
  leaf: 1.1,
  /** Название: Manrope 700, трекинг −0.03em. */
  title: 1.04,
} as const;

export type Face = keyof typeof FACE;

/**
 * Строк у текста кеглем `sizeVh` в колонке `widthVh` — и сколько из них покажет стена:
 * не больше `max`, дальше многоточие (`all` — сколько строк было бы без обрезки).
 */
export function textLines(text: string, widthVh: number, sizeVh: number, max: number, face: Face): { lines: number; clamped: boolean; all: number } {
  const all = wrapLines(text, widthVh / (sizeVh * FACE[face]));
  return { lines: Math.max(1, Math.min(all, max)), clamped: all > max, all };
}

/** Ширина текста в одну строку, vh. */
export function lineWidth(text: string, sizeVh: number, face: Face): number {
  return emWidth(text.trim()) * sizeVh * FACE[face];
}

/**
 * Самая узкая колонка (с точностью до четверти vh), в которой текст ложится в те же строки,
 * что и в колонке `widthVh`: узел в две строки не шире своих строк, а не во всю сторону.
 * Одна строка — ширина строки; обрезанный текст — вся колонка.
 */
export function snugWidth(text: string, widthVh: number, sizeVh: number, max: number, face: Face): number {
  const target = textLines(text, widthVh, sizeVh, max, face);
  if (target.clamped) return widthVh;
  const line = lineWidth(text, sizeVh, face);
  if (target.lines === 1) return Math.min(widthVh, line);
  let low = line / target.lines;
  let high = widthVh;
  while (high - low > 0.25) {
    const mid = (low + high) / 2;
    if (textLines(text, mid, sizeVh, max, face).all <= target.lines) high = mid;
    else low = mid;
  }
  return high;
}
