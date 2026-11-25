import type { SpeechTone } from "./board";

/**
 * How the assistant says a line under its face (D-181): live captions. What in a line is the
 * verdict, a fact, who and what — and the moment the voice reaches every word. Pure, no React: the
 * band (`components/pulse/Assistant.tsx`) only draws what this decides.
 */

/** A line the assistant says: a new `id` is a new line. */
export type SaidLine = { id: string; text: string; tone?: SpeechTone };

/* -------------------------------------------------------------------------- */
/* Reading a line: what in it is the verdict, a fact, who and what              */
/* -------------------------------------------------------------------------- */

/** The tones that colour a line; `muted` and no tone leave it without colour. */
export type Hue = "danger" | "warn" | "ok";
/**
 * quiet — the grey frame; plain — white 400: who and what, a list item, the first sentence of a line
 * with no facts; fact — a count or a time: white 600 in the headline (when there are at most two),
 * white 400 elsewhere; verdict — the line's one unit in the colour of its tone, 600.
 */
export type Look = "quiet" | "plain" | "fact" | "verdict";
/** `glue` — the piece's words never part across two rows (a count, a time, «Ерлан Б.»); `quote` — a grey quote that stays grey */
export type Piece = { text: string; look: Look; glue?: boolean; quote?: boolean };
type Kind = "verdict" | "count" | "time" | "number" | "name" | "title";
type Hit = { at: number; end: number; kind: Kind; rank: number };

export function hueOf(tone: SpeechTone | undefined): Hue | undefined {
  return tone === "danger" || tone === "warn" || tone === "ok" ? tone : undefined;
}

/** The greeting the briefing opens with («Доброе утро, Асхат.»), and the space after it. */
export const GREETING = /^((?:Доброе утро|Добрый день|Добрый вечер|Доброй ночи|Здравствуйте)(?:,[^.!?]*)?[.!])(\s+)/u;
/** The assistant speaking of itself, not of the board: read as plain words, never as facts. */
export const SERVICE = /^(?:Не разобрал|Не понял|Понял так|Отправляю|Смотрю|Пока отвечаю только)/u;
/** «Ждут вас: X, Y и Z» — the employee's list of what waits for them. */
const WAITING = /^(Жд(?:ут|ёт) вас)(:\s*)(.*?)([.!?…]*)$/u;
/** A «no» or a zero takes the colour off the counts of a line: «Просрочек нет», «ни задачи». */
export const NEGATION = /(?<![\p{L}\d])(?:нет|ни|ничего|никого|никто|0)(?![\p{L}\d])/iu;
/** The first sentence of a text, with its full stop. */
const FIRST_SENTENCE = /^.*?[.!?…]+(?=\s|$)/u;
/** The counts whose words say the line's tone: in a red line the overdue one is the verdict, not the first. */
const FITS: Partial<Record<Hue, RegExp>> = {
  danger: /просроч|отказ/iu,
  warn: /нов|доработк|вопрос|сообщени|приглашени|объявлени/iu,
};

/** A word starts and ends here (`\b` does not know Cyrillic). */
const AT = "(?<![\\p{L}\\d])";
const END = "(?![\\p{L}\\d])";
const CLOCK = "\\d{1,2}:\\d{2}";
const DATE = "\\d{1,2}\\.\\d{1,2}(?:\\.\\d{4})?";
// humanAqtobe: «сегодня 18:00», «завтра 9:00», «пт 18:00», «16.11 18:00»
const DAY = `(?:сегодня|завтра|послезавтра|вчера|пн|вт|ср|чт|пт|сб|вс|${DATE})`;
const MONTHS = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";
const WEEKDAYS = "понедельника|вторника|среды|четверга|пятницы|субботы|воскресенья";
/** «в работе», «на проверке» after a count: one unit with it (the older «на приёмке» still parses) */
const STATE = "(?:в работе|на приёмке|на доработке|на проверке|с просрочкой|просрочен[аоы]?)";
/** «в работе 4», «закрыто 12», «Просрочено 1:» — the summary's word and its number */
const SUMMARY = "(?:в работе|на приёмке|на проверке|закрыто|просрочено|отказов|жд(?:ут|ёт) ответа)";
/** «новые», «новых» — an adjective takes the noun after it into the count */
const ADJECTIVE = "\\p{L}+(?:ая|ое|ые|ых|ый|ий|ие|их|ой|ее|яя)";

/** In order of rank: at one start, the longer match wins, then the earlier rule. */
const RULES: { kind: Kind; re: RegExp }[] = [
  // the words that are the line's verdict by themselves; «Отчёт за день ещё не сдан» is one
  {
    kind: "verdict",
    re: new RegExp(`${AT}(?:пока тихо|всё сдано|всё сделано|дел нет|нового нет|жд(?:ут|ёт) вас|(?:отчёт за день\\s+)?(?:ещё\\s+)?не сдан[аоы]?)${END}`, "giu"),
  },
  // a deadline as one unit, in every form humanAqtobe and the builders give it
  {
    kind: "time",
    re: new RegExp(
      `${AT}(?:(?:до|к|с|в|на)\\s+)?(?:${DAY}(?:\\s+в)?\\s+${CLOCK}|\\d{1,2}\\s+(?:${MONTHS})(?:\\s+(?:в\\s+)?${CLOCK})?|(?:${WEEKDAYS})(?:\\s+(?:в\\s+)?${CLOCK})?|${CLOCK}|${DATE})${END}`,
      "giu",
    ),
  },
  // 1 просрочка · 2 новые задачи · 2 задачи в работе · 2 на проверке · в работе 4 · Один отказ
  {
    kind: "count",
    re: new RegExp(
      `${AT}(?:\\d+\\s+(?:(?:на|в|с)\\s+\\p{L}+|(?:${ADJECTIVE}\\s+)?\\p{L}+(?:\\s+${STATE})?)|${SUMMARY}\\s+\\d+(?:\\s+\\p{L}{3,})?|(?:один|одна|одно|одну)\\s+\\p{L}+)${END}`,
      "giu",
    ),
  },
  // «на проверке у директора — 2»: the number after a dash
  { kind: "number", re: /(?<=[—–]\s+)\d+(?![\p{L}\d])/gu },
  // «Тимур:», «Марат, «Отчёт»», «Ерлан Б.», «Марат пишет по…» — any alphabet with capitals, Kazakh
  // too (no `i`: case matters)
  { kind: "name", re: /(?<![\p{L}\d])\p{Lu}\p{Ll}+(?: \p{Lu}\.)?(?=:|,\s*«|\s+(?:пишет|спрашивает|просит|не может|предлагает)(?!\p{L}))/gu },
  { kind: "title", re: /«[^»]*»/gu },
];

/** The words that open a list as a name would («Принято:», «Отменено:») — a name ending in «о» stays one. */
const NOT_A_NAME =
  /^(?:Принято|Отменено|Сдано|Просрочено|Отправлено|Закрыто|Выполнено|Отклонено|Перенесено|Назначено|Поручено|Создано|Готово|Было|Итого|Всего)$/u;

/** The part of a line a count belongs to: between the stops and commas around it. */
function clauseOf(text: string, at: number, end: number): string {
  const STOP = /[,.;:!?—–]/u;
  let from = at;
  while (from > 0 && !STOP.test(text[from - 1]!)) from--;
  let to = end;
  while (to < text.length && !STOP.test(text[to]!)) to++;
  return text.slice(from, to);
}

function hitsOf(text: string): Hit[] {
  const all: Hit[] = [];
  RULES.forEach(({ kind, re }, rank) => {
    for (const m of text.matchAll(re)) {
      const at = m.index ?? 0;
      // «Принято:», «Отменено:» are not people
      if (kind === "name" && NOT_A_NAME.test(m[0])) continue;
      all.push({ at, end: at + m[0].length, kind, rank });
    }
  });
  all.sort((a, b) => a.at - b.at || b.end - b.at - (a.end - a.at) || a.rank - b.rank);
  const picked: Hit[] = [];
  for (const hit of all) if (hit.at >= (picked[picked.length - 1]?.end ?? 0)) picked.push(hit);
  return picked;
}

/** A «title» that is not one: a tab («в «Делах»»), a message quoted at length, a quote after «пишет …:». */
function quietQuote(body: string, at: number, end: number): boolean {
  const before = body.slice(0, at);
  return end - at - 2 > 36 || /(?:^|\s)во?\s+$/u.test(before) || (/:\s*$/u.test(before) && /пишет|спрашивает/u.test(before));
}

/** A line with nothing to mark still has its point: its first sentence is white («Просрочек нет.»). */
function firstSentenceWhite(pieces: Piece[], body: string): Piece[] {
  const end = FIRST_SENTENCE.exec(body)?.[0].length ?? body.length;
  const out: Piece[] = [];
  let pos = 0;
  for (const piece of pieces) {
    const from = pos;
    pos += piece.text.length;
    if (piece.look !== "quiet" || piece.quote || from >= end) out.push(piece);
    else if (pos <= end) out.push({ text: piece.text, look: "plain" });
    else out.push({ text: piece.text.slice(0, end - from), look: "plain" }, { text: piece.text.slice(end - from), look: "quiet" });
  }
  return out;
}

/**
 * The body of a line cut into pieces; put together they are the text. One colour a line at most —
 * its tone's — and it stands on the verdict: a verdict word («Пока тихо», «Ждут вас», «Отчёт за день
 * ещё не сдан»), else the first count whose words say the tone («2 просрочены» in a red line), else
 * the first count. A calm line colours only its verdict words; a «no» or a zero keeps the counts
 * colourless; a muted line or one with no tone has no colour at all.
 */
export function piecesOf(body: string, tone: SpeechTone | undefined): Piece[] {
  const hue = hueOf(tone);
  if (SERVICE.test(body)) {
    // the assistant about itself: its first sentence white; a warning's second sentence is the verdict
    const first = FIRST_SENTENCE.exec(body)?.[0] ?? body;
    const rest = body.slice(first.length);
    const second = hue && hue !== "ok" ? /^(\s+)(.*?[.!?…]+)(?=\s|$)([\s\S]*)$/u.exec(rest) : null;
    if (!second) return [{ text: first, look: "plain" }, { text: rest, look: "quiet" }];
    return [
      { text: first, look: "plain" },
      { text: second[1]!, look: "quiet" },
      { text: second[2]!, look: "verdict" },
      { text: second[3]!, look: "quiet" },
    ];
  }
  const waiting = WAITING.exec(body);
  if (waiting) {
    // the head carries the colour; the things waiting are white, each one kept whole while it fits a
    // row, the «,» and «и» between them grey («и» goes along with the item after it)
    const items = waiting[3]!.split(/(,\s+|\s+и\s+)/u).map((text, i): Piece => (i % 2 === 0 ? { text, look: "plain", glue: true } : { text, look: "quiet" }));
    return [{ text: waiting[1]!, look: hue ? "verdict" : "fact", glue: true }, { text: waiting[2]!, look: "quiet" }, ...items, { text: waiting[4]!, look: "quiet" }];
  }
  const hits = hitsOf(body);
  const words = hits.filter((h) => h.kind === "verdict");
  const blanked = words.reduce((text, h) => text.slice(0, h.at) + " ".repeat(h.end - h.at) + text.slice(h.end), body);
  // a «no» or a zero takes the colour off the counts of its own clause only: «1 просрочка, ответа нет»
  // keeps its red verdict
  const counts =
    hue === "danger" || hue === "warn" ? hits.filter((h) => h.kind === "count" && !NEGATION.test(clauseOf(blanked, h.at, h.end))) : [];
  const fits = hue ? FITS[hue] : undefined;
  // red stands only on what is red (an overdue, a refusal); a warning may fall back to its first count
  const verdict = hue
    ? (words[0] ?? counts.find((h) => fits?.test(body.slice(h.at, h.end))) ?? (hue === "danger" ? undefined : counts[0]))
    : undefined;
  const pieces: Piece[] = [];
  let from = 0;
  for (const hit of hits) {
    if (hit.at > from) pieces.push({ text: body.slice(from, hit.at), look: "quiet" });
    const text = body.slice(hit.at, hit.end);
    if (hit === verdict) pieces.push({ text, look: "verdict", glue: true });
    else if (hit.kind === "title") pieces.push(quietQuote(body, hit.at, hit.end) ? { text, look: "quiet", quote: true } : { text, look: "plain" });
    else if (hit.kind === "name") pieces.push({ text, look: "plain", glue: true });
    else pieces.push({ text, look: "fact", glue: true });
    from = hit.end;
  }
  if (from < body.length) pieces.push({ text: body.slice(from), look: "quiet" });
  return pieces.some((p) => p.look === "fact" || p.look === "verdict") ? pieces : firstSentenceWhite(pieces, body);
}

/* -------------------------------------------------------------------------- */
/* Saying it: every word gets the moment the voice reaches it                   */
/* -------------------------------------------------------------------------- */

/** White, or a tone's colour. */
export type Tint = "text" | Hue;
/** What a run of letters is drawn in: "" — the line's grey; a tint in 400; a tint in 600 (« bold»). */
export type Ink = "" | Tint | `${Tint} bold`;
/** A run of a word in one look. */
export type Frag = { text: string; ink: Ink };
/** rise — the grey and white words; shine — a white fact of the headline; flare — the verdict in its colour. */
export type Anim = "rise" | "shine" | "flare";
/** A word is what the voice says at once — one moving box, never parted from its punctuation. */
export type Word = { word: string; frags: Frag[]; anim: Anim; hue?: Hue; syllables: number; pause: number; at: number; greet: boolean };
/**
 * Why a space never breaks: inside a unit, before a dash (a dash never opens a row), after a short
 * word («и», «в», «на», «2» never hang at a row's end). `afterShort` — the word before it is short.
 */
export type Space = { space: string; glue: "" | "unit" | "dash" | "short"; afterShort: boolean };
export type Token = Word | Space;
/** A line as it is said: the greeting as a quiet row of its own (`kicker`), the space after it, the rest. */
export type Said = { id: string; head: boolean; kicker: Token[] | null; between: string; body: Token[] };

const PUNCT_TAIL = /^[,.:;!?…)»]+$/u;
const PUNCT_OPEN = /^[(«„"]+$/u;
const SHORT = /^(?:\d+|\p{L}{1,3})$/u;
/** A unit longer than this may break, but only inside: nothing ever runs off the screen. */
export const KEEP_MAX = 24;
/** A word this long breaks anywhere, and no run holds it. */
export const LONG_WORD = 18;

/** Syllables: the vowels of the word (Kazakh ones too); a digit is said almost as one. */
function syllablesOf(word: string): number {
  const vowels = word.match(/[аеёиоуыэюяәөұүіaeiouy]/giu)?.length ?? 0;
  const digits = word.match(/\d/g)?.length ?? 0;
  return Math.max(1, vowels + digits * 0.8);
}

/** The breath after a word, in seconds — the floor no squeezing goes under. */
function pauseOf(word: string): number {
  if (/[.!?…][»")]*$/u.test(word)) return 0.11;
  if (/[:;][»")]*$/u.test(word)) return 0.08;
  if (/,[»")]*$/u.test(word) || word === "—" || word === "–") return 0.05;
  return 0;
}

/** The ink of a look: `bold` — a fact of the headline when it has at most two. */
function inkOf(look: Look, hue: Hue | undefined, bold: boolean): Ink {
  if (look === "quiet") return "";
  if (look === "verdict" && hue) return `${hue} bold`;
  if (look === "fact" && bold) return "text bold";
  return "text";
}

/** The same ink in the light weight — for punctuation riding with a coloured or white run. */
function lightOf(ink: Ink): Ink {
  return ink.endsWith(" bold") ? (ink.slice(0, -" bold".length) as Tint) : ink;
}

function tokensOf(pieces: Piece[], hue: Hue | undefined, bold: boolean, pace = 1, greet = false): Token[] {
  const tokens: Token[] = [];
  let frags: { frag: Frag; look: Look }[] = [];
  const flush = () => {
    if (frags.length === 0) return;
    // «,» after a coloured or white run takes its colour in the light weight; «(» or «« before one, too
    frags.forEach((f, i) => {
      if (f.look !== "quiet") return;
      const before = frags[i - 1];
      const after = frags[i + 1];
      if (before && before.look !== "quiet" && PUNCT_TAIL.test(f.frag.text)) f.frag = { ...f.frag, ink: lightOf(before.frag.ink) };
      else if (after && after.look !== "quiet" && PUNCT_OPEN.test(f.frag.text)) f.frag = { ...f.frag, ink: lightOf(after.frag.ink) };
    });
    const word = frags.map((f) => f.frag.text).join("");
    const coloured = frags.some((f) => f.look === "verdict") && hue;
    const lit = frags.some((f) => f.look === "fact") && bold;
    const anim: Anim = coloured ? "flare" : lit ? "shine" : "rise";
    tokens.push({
      word,
      frags: frags.map((f) => f.frag),
      anim,
      hue: coloured ? hue : undefined,
      syllables: syllablesOf(word) * pace,
      pause: pauseOf(word) * pace,
      at: 0,
      greet,
    });
    frags = [];
  };
  for (const piece of pieces) {
    const ink = inkOf(piece.look, hue, bold);
    for (const part of piece.text.split(/(\s+)/u)) {
      if (!part) continue;
      if (/^\s+$/u.test(part)) {
        flush();
        tokens.push({ space: part, glue: piece.glue && piece.look !== "quiet" ? "unit" : "", afterShort: false });
      } else frags.push({ frag: { text: part, ink }, look: piece.look });
    }
  }
  flush();
  tokens.forEach((token, i) => {
    if (!("space" in token)) return;
    const before = tokens[i - 1];
    const after = tokens[i + 1];
    token.afterShort = before !== undefined && "word" in before && SHORT.test(before.word);
    if (after && "word" in after && /^[—–]/u.test(after.word)) token.glue = "dash";
    else if (!token.glue && token.afterShort) token.glue = "short";
  });
  return tokens;
}

/** However long, the last word sets out by then — and cools as the mouth stops (1.2 s). */
export const LAST_MAX_S = 0.8;
const SYLLABLE_MIN_S = 0.012;
const SYLLABLE_MAX_S = 0.06;
const BETWEEN_LINES_S = 0.12;
/** While the last reply lifts away, the new one waits this long: two texts never mix. */
export const GHOST_SHIFT_S = 0.06;

/**
 * One clock through the whole reply, in reading order. The breaths come first and are not squeezed
 * (a full stop ≥ 110 ms, a colon ≥ 80, a comma or a dash ≥ 50, a line ≥ 120); the syllables share
 * what is left of the target — 0.45 s for a few words, up to 0.78 s for a long reply.
 */
function timeAll(words: Word[]): number {
  if (words.length === 0) return 0;
  const target = words.length < 6 ? 0.45 : Math.min(0.78, Math.max(0.5, 0.3 + 0.035 * words.length));
  const lead = words.slice(0, -1);
  const pauses = lead.reduce((s, w) => s + w.pause, 0);
  const syllables = lead.reduce((s, w) => s + w.syllables, 0);
  let unit = syllables > 0 ? Math.min(SYLLABLE_MAX_S, Math.max(SYLLABLE_MIN_S, (target - pauses) / syllables)) : 0;
  let squeeze = 1;
  const end = pauses + syllables * unit;
  if (end > LAST_MAX_S) {
    squeeze = LAST_MAX_S / end;
    unit *= squeeze;
  }
  let t = 0;
  for (const w of words) {
    w.at = t;
    t += w.syllables * unit + w.pause * squeeze;
  }
  return words[words.length - 1]!.at;
}

/** A line is the same line while its id, tone and words are: then it stays on screen as it is. */
export const lineKeyOf = (line: SaidLine) => `${line.id}\u0001${line.tone ?? ""}\u0001${line.text}`;

/**
 * A reply as it is said: every line cut into words, each word with the moment it sets out (`at`, in
 * seconds from the reply's start), and `last` — when the last word does. `kept` — the keys of lines
 * already on screen (`lineKeyOf`): they are not said again, so the clock runs through the new ones only.
 */
export function sayAll(lines: readonly SaidLine[], kept?: ReadonlySet<string>): { said: Said[]; last: number } {
  const said = lines.map((line, index): Said => {
    const head = index === 0;
    const greeting = GREETING.exec(line.text);
    const rest = greeting ? line.text.slice(greeting[0].length) : line.text;
    const hue = hueOf(line.tone);
    const pieces = piecesOf(rest, line.tone);
    // a headline of many counts is a wall in 600: then only its verdict stands up
    const bold = head && pieces.filter((p) => p.look === "fact").length <= 2;
    // the greeting is a quiet row of its own, said twice as fast: it is known before it is said
    const kicker = greeting ? tokensOf([{ text: greeting[1]!, look: "quiet" }], undefined, false, 0.5, true) : null;
    return { id: line.id, head, kicker, between: greeting ? greeting[2]! : "", body: tokensOf(pieces, hue, bold) };
  });
  const words: Word[] = [];
  for (const [i, line] of said.entries()) {
    if (kept?.has(lineKeyOf(lines[i]!))) continue;
    const own = [...(line.kicker ?? []), ...line.body].filter((t): t is Word => "word" in t);
    const lastOfLine = own[own.length - 1];
    if (lastOfLine) lastOfLine.pause = Math.max(lastOfLine.pause, BETWEEN_LINES_S);
    words.push(...own);
  }
  return { said, last: timeAll(words) };
}

/* -------------------------------------------------------------------------- */
/* Rows: what never parts                                                       */
/* -------------------------------------------------------------------------- */

const lengthOf = (run: Token[]) => run.reduce((n, t) => n + ("space" in t ? 1 : t.word.length), 0);

/**
 * Runs of words that stay on one row. A run too long to fit is cut only inside its units, never after
 * a short word or before a dash; a run that holds a very long word is let go whole.
 */
export function runsOf(tokens: Token[]): Token[][] {
  const runs: Token[][] = [];
  for (const token of tokens) {
    const last = runs[runs.length - 1];
    const prev = last?.[last.length - 1];
    const joins = ("space" in token && token.glue !== "") || (prev !== undefined && "space" in prev && prev.glue !== "");
    if (joins && last) last.push(token);
    else runs.push([token]);
  }
  return runs.flatMap((run) => {
    if (run.length === 1 || lengthOf(run) < KEEP_MAX) return [run];
    if (run.some((t) => "word" in t && t.word.length >= LONG_WORD)) return run.map((t) => [t]);
    const parts: Token[][] = [[]];
    for (const token of run) {
      if ("space" in token && token.glue === "unit" && !token.afterShort) parts.push([token], []);
      else parts[parts.length - 1]!.push(token);
    }
    return parts.filter((p) => p.length > 0);
  });
}
