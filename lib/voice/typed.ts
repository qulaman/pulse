import type { ComposePin } from "@/lib/store/compose";

/**
 * The deadline chips under the field (D-192): rows of «Слова о сроках» (lib/ai/conventions.ts) the
 * parser already reads, added after the typed text — end of today, tomorrow, end of the week and of
 * the month, all 18:00 (not «до пятницы»: a weekday alone is 09:00). One at a time; a second tap
 * takes it off.
 */
export const DUE_PRESETS = [
  { label: "Сегодня", words: "до конца дня" },
  { label: "Завтра", words: "до завтра" },
  { label: "Конец недели", words: "до конца недели" },
  { label: "Конец месяца", words: "до конца месяца" },
] as const;

/** The text the parser gets: the address of a pinned person in front, the chosen deadline after. */
export function composedText(text: string, pin: ComposePin | null, due: string | null): string {
  const body = due ? `${text.replace(/[\s.,;!]+$/, "")} ${due}` : text;
  return pin ? `${pin.address}${body}` : body;
}
