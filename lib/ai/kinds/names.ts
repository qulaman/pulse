/**
 * The kinds of entity the parser may answer with (task 026), in the fixed order the prompt,
 * the few-shot and the schema follow. Plain values only — the settings page imports them and
 * must stay free of zod and the SDK (D-126). `delegation` lives in the app's schema only (D-78).
 */
export const PARSER_KINDS = ["announcement", "task", "points", "reminder", "note", "event", "recurrence", "query"] as const;
export type ParserKind = (typeof PARSER_KINDS)[number];

/** A company can switch every kind off but this one: an order is what the parser is for. */
export const REQUIRED_KIND: ParserKind = "task";

export const PARSER_KIND_LABEL: Record<ParserKind, string> = {
  announcement: "Объявления всем",
  task: "Поручения",
  points: "Очки",
  reminder: "Напоминания себе",
  note: "Заметки себе",
  event: "Мероприятия",
  recurrence: "Повторы",
  query: "Вопросы о делах",
};

/**
 * Whatever a company stored → known kinds in the fixed order, `task` always among them.
 * Nothing stored is every kind; an unknown name is dropped, never an error.
 */
export function normalizeKinds(kinds: readonly string[] | null | undefined): ParserKind[] {
  if (!kinds) return [...PARSER_KINDS];
  const on = new Set(kinds);
  return PARSER_KINDS.filter((kind) => kind === REQUIRED_KIND || on.has(kind));
}
