import { entryKey, nearSpelling } from "@/lib/dictionary";
import { pluralRu } from "@/lib/tasks/status-text";
import { stem, stems } from "@/lib/text/normalize";

/**
 * How the company's words live in its speech (D-111, words wave): how often each word of
 * the vocabulary came up in the parsed phrases of the last month, and which names keep
 * coming up that the vocabulary does not have. Pure — the server counts over `ai_logs`
 * transcripts and hands out numbers and words only, never a phrase.
 */

export type Transcript = { transcript: string | null; created_at: string };
export type WordUsage = { count: number; lastAt: string | null };

function containsSequence(haystack: readonly string[], needle: readonly string[]): boolean {
  outer: for (let i = 0; i + needle.length <= haystack.length; i++) {
    for (let j = 0; j < needle.length; j++) if (haystack[i + j] !== needle[j]) continue outer;
    return true;
  }
  return false;
}

/**
 * In how many phrases each word came up, and when last — by stems, so «с КазАзотом»
 * counts for «КазАзот». Keyed by `entryKey`. A word written differently in speech («каз
 * азот») does not count — that is exactly the word the vocabulary is there to fix.
 */
export function usageOf(words: readonly string[], rows: readonly Transcript[]): Record<string, WordUsage> {
  const phrases = rows
    .filter((row): row is { transcript: string; created_at: string } => Boolean(row.transcript))
    .map((row) => ({ stems: stems(row.transcript), at: row.created_at }));
  const out: Record<string, WordUsage> = {};
  for (const word of words) {
    const needle = stems(word);
    const usage: WordUsage = { count: 0, lastAt: null };
    if (needle.length) {
      for (const phrase of phrases) {
        if (!containsSequence(phrase.stems, needle)) continue;
        usage.count += 1;
        if (!usage.lastAt || phrase.at > usage.lastAt) usage.lastAt = phrase.at;
      }
    }
    out[entryKey(word)] = usage;
  }
  return out;
}

export type WordSuggestion = {
  /** The stem key of the main spelling. */
  key: string;
  /** Every stem key of the suggestion — what «×» hides for good, variants included. */
  keys: string[];
  /** The form heard most often (a form without a case ending preferred). */
  word: string;
  /** Other spellings of the same name — the recogniser writes it differently: the vocabulary's case. */
  variants: string[];
  count: number;
  lastAt: string;
};

const TOKEN = /[\p{L}\p{N}][\p{L}\p{N}-]*/gu;
const SENTENCE_END = /[.!?…:;\n]/u;

/** Two stem keys are one name written differently: «касхром» and «казхром». */
function sameName(a: string, b: string): boolean {
  return nearSpelling(a, b) > 0;
}

type Found = { forms: Map<string, number>; count: number; lastAt: string };

/**
 * Names the speech keeps using that the vocabulary does not know (D-111, words wave):
 * capitalised mid-sentence, in capitals (ERG) or with a capital inside (КазАзот);
 * neighbouring ones join into one name (ТОО Береке). What is not a name:
 *  - a capital at a sentence start — and after an addressee: the recogniser writes
 *    «Ерлан, Срочно зайди», so a phrase that opens with people's names starts after them;
 *  - a word the speech also has in lower case somewhere («срочно», «подготовь»);
 *  - people's names, words already in the vocabulary, a misspelling of a vocabulary word,
 *    and what «×» hid.
 * Spellings of one name are counted together («Касхрома», «Казхрома»): that the recogniser
 * writes a name two ways is the very reason to put it in the vocabulary. A name has to come
 * up in two phrases at least.
 */
export function suggestWords(
  rows: readonly Transcript[],
  known: { names: readonly string[]; vocabulary: readonly string[]; dismissed: readonly string[] },
  options: { min?: number; limit?: number } = {},
): WordSuggestion[] {
  const min = options.min ?? 2;
  const limit = options.limit ?? 10;
  const people = new Set(known.names.flatMap((name) => stems(name)));
  const vocabulary = known.vocabulary.map((word) => stems(word));
  const vocabularyKeys = vocabulary.map((word) => word.join(" "));
  const hidden = new Set(known.dismissed);

  // what the speech also writes in lower case is an ordinary word, whatever its capital once
  const lower = new Set<string>();
  for (const row of rows) {
    for (const match of (row.transcript ?? "").matchAll(TOKEN)) {
      if (/^\p{Ll}/u.test(match[0])) lower.add(stem(entryKey(match[0])));
    }
  }

  const found = new Map<string, Found>();
  for (const row of rows) {
    const text = row.transcript;
    if (!text) continue;
    const seen = new Set<string>();
    let run: string[] = [];
    let last = -1;
    // where the current sentence began, and whether only people's names came since
    let opening = true;
    const flush = () => {
      if (!run.length) return;
      const phrase = run.join(" ");
      run = [];
      const key = stems(phrase).join(" ");
      if (!key || seen.has(key) || hidden.has(key)) return;
      const keyStems = key.split(" ");
      if (keyStems.every((s) => people.has(s))) return;
      if (vocabulary.some((word) => word.length && containsSequence(keyStems, word))) return;
      if (vocabularyKeys.some((word) => sameName(word, key))) return;
      seen.add(key);
      const entry = found.get(key) ?? { forms: new Map<string, number>(), count: 0, lastAt: row.created_at };
      entry.count += 1;
      entry.forms.set(phrase, (entry.forms.get(phrase) ?? 0) + 1);
      if (row.created_at > entry.lastAt) entry.lastAt = row.created_at;
      found.set(key, entry);
    };
    for (const match of text.matchAll(TOKEN)) {
      const token = match[0];
      const at = match.index ?? 0;
      const gap = text.slice(Math.max(last, 0), at);
      if (last === -1 || SENTENCE_END.test(gap)) opening = true;
      const own = people.has(stem(entryKey(token)));
      const namelike = isNamelike(token, opening) && !own && (hasInnerCapital(token) || !lower.has(stem(entryKey(token))));
      if (namelike) {
        // a name continues only across plain spaces: «ТОО Береке», not «Береке, Шубарколь»
        if (run.length && !/^\s+$/.test(gap)) flush();
        if (run.length < 3) run.push(token);
      } else {
        flush();
      }
      // the addressee keeps the sentence opening: «Ерлан, Срочно…» is still its start
      if (!own) opening = false;
      last = at + token.length;
    }
    flush();
  }

  // spellings of one name go together, the most heard leads
  const ordered = [...found.entries()].sort((a, b) => b[1].count - a[1].count);
  const clusters: { keys: string[]; entries: Found[] }[] = [];
  for (const [key, entry] of ordered) {
    const home = clusters.find((c) => sameName(c.keys[0], key));
    if (home) {
      home.keys.push(key);
      home.entries.push(entry);
    } else clusters.push({ keys: [key], entries: [entry] });
  }

  return clusters
    .map((cluster) => {
      const forms = new Map<string, number>();
      for (const entry of cluster.entries) for (const [form, n] of entry.forms) forms.set(form, (forms.get(form) ?? 0) + n);
      const byUse = [...forms.entries()].sort((a, b) => b[1] - a[1]).map(([form]) => form);
      // a form without a case ending reads as the name itself: «Казхром», not «Казхрома»
      const word = byUse.find((form) => stems(form).join(" ") === entryKey(form)) ?? byUse[0];
      return {
        key: cluster.keys[0],
        keys: cluster.keys,
        word,
        variants: byUse.filter((form) => form !== word && stems(form).join(" ") !== stems(word).join(" ")),
        count: cluster.entries.reduce((sum, entry) => sum + entry.count, 0),
        lastAt: cluster.entries.reduce((at, entry) => (entry.lastAt > at ? entry.lastAt : at), ""),
      };
    })
    .filter((s) => s.count >= min)
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : -1))
    .slice(0, limit);
}

function hasInnerCapital(token: string): boolean {
  const letters = token.replace(/[^\p{L}]/gu, "");
  return /\p{Lu}/u.test(letters.slice(1));
}

function isNamelike(token: string, sentenceStart: boolean): boolean {
  if (/^\p{N}+$/u.test(token)) return false;
  const letters = token.replace(/[^\p{L}]/gu, "");
  if (letters.length >= 2 && letters === letters.toUpperCase() && letters !== letters.toLowerCase()) return true; // ERG, ТОО
  if (hasInnerCapital(token)) return true; // КазАзот
  // a capital at a sentence start is grammar, not a name
  return !sentenceStart && /^\p{Lu}/u.test(token) && letters.length >= 3;
}

const DAY_MS = 86_400_000;
const AQTOBE_MS = 5 * 3_600_000;

/** The calendar day in Aqtobe of an instant, as a day number. */
function aqtobeDay(ms: number): number {
  return Math.floor((ms + AQTOBE_MS) / DAY_MS);
}

/** «сегодня», «вчера», «5 дней назад» — by the calendar day in Aqtobe, not by 24-hour spans. */
export function whenLine(iso: string, now = Date.now()): string {
  const days = aqtobeDay(now) - aqtobeDay(new Date(iso).getTime());
  if (days <= 0) return "сегодня";
  if (days === 1) return "вчера";
  return `${days} ${pluralRu(days, ["день", "дня", "дней"])} назад`;
}

/** «12 сентября» in Aqtobe. */
export function dayMonth(iso: string): string {
  return new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Asia/Aqtobe" }).format(new Date(iso));
}

/** Days since an instant, by Aqtobe calendar days. */
export function daysSince(iso: string, now = Date.now()): number {
  return aqtobeDay(now) - aqtobeDay(new Date(iso).getTime());
}
