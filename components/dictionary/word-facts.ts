import { entryKey, type WordKind, type WordKindDef, type WordMeta } from "@/lib/dictionary";
import type { WordStats } from "@/lib/dictionary-queries";
import { daysSince, whenLine, type WordUsage } from "@/lib/dictionary-usage";
import { pluralRu } from "@/lib/tasks/status-text";

/** A word nobody said for this long is dead weight in the STT prompt. */
export const STALE_DAYS = 30;
/** Fewer phrases in the month than this, and «не встречалось» says nothing about the word. */
export const MIN_PHRASES = 30;

export type WordFact = {
  word: string;
  key: string;
  kind: WordKind | null;
  meta: WordMeta | null;
  usage: WordUsage | null;
  /** Unused for a month while the month had enough speech to tell. */
  stale: boolean;
  /** The row's second line: «12 раз · вчера», «не встречалось 30 дней», «добавлено сегодня». */
  line: string;
};

export function timesLine(count: number): string {
  return `${count} ${pluralRu(count, ["раз", "раза", "раз"])}`;
}

/** Each word of the vocabulary with what the screen says about it (D-111, words wave). */
export function wordFacts(
  vocabulary: readonly string[],
  meta: Readonly<Record<string, WordMeta>>,
  stats: WordStats | undefined,
  kinds: readonly WordKindDef[],
  now = Date.now(),
): WordFact[] {
  const known = new Set(kinds.map((k) => k.id));
  const enough = (stats?.phrases ?? 0) >= MIN_PHRASES;
  return vocabulary.map((word) => {
    const key = entryKey(word);
    const own = meta[key] ?? null;
    const usage = stats?.usage[key] ?? null;
    const young = own?.added_at ? daysSince(own.added_at, now) < STALE_DAYS : false;
    const added = own?.added_at ? `добавлено ${whenLine(own.added_at, now)}` : "";
    let line = added;
    let stale = false;
    if (usage && usage.count > 0 && usage.lastAt) line = `${timesLine(usage.count)} · ${whenLine(usage.lastAt, now)}`;
    else if (usage && enough && !young) {
      stale = true;
      line = `не встречалось ${STALE_DAYS} дней`;
    } else if (usage) line = added ? `пока не встречалось · ${added}` : "пока не встречалось";
    // a type since removed reads as «Без типа»
    const kind = own?.kind && known.has(own.kind) ? own.kind : null;
    return { word, key, kind, meta: own, usage, stale, line };
  });
}
