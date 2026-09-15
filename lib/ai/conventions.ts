import { z } from "zod";

/**
 * Company time conventions (D-15): what «до обеда» or «к вечеру» means for THIS
 * company. Data, not prompt text — the director edits the rows on the settings page
 * and the parser prompt renders them (docs/AI.md §2 rule 3). Defaults are the table
 * client №1 approved; a new company starts from them and adjusts.
 */
export const ConventionSchema = z.object({
  /** As spoken, several forms through « / »: «вечером / к вечеру». */
  phrase: z.string().trim().min(1).max(80),
  /** What it resolves to, in words the model can compute from: «18:00 названного дня». */
  meaning: z.string().trim().min(1).max(120),
  /** deadline_confidence the parser assigns when this row fires. */
  confidence: z.number().min(0).max(1).default(0.7),
});

export type Convention = z.infer<typeof ConventionSchema>;

export const DEFAULT_CONVENTIONS: Convention[] = [
  { phrase: "до обеда", meaning: "13:00 названного дня", confidence: 0.7 },
  { phrase: "к обеду", meaning: "12:30 названного дня", confidence: 0.7 },
  { phrase: "вечером / к вечеру / до вечера", meaning: "18:00 названного дня", confidence: 0.7 },
  { phrase: "до конца дня / к концу дня", meaning: "18:00 названного дня", confidence: 0.7 },
  { phrase: "после обеда", meaning: "14:00 названного дня", confidence: 0.6 },
  { phrase: "утром / с утра", meaning: "09:00 названного дня", confidence: 0.7 },
  { phrase: "к концу недели / до конца недели", meaning: "ближайшая пятница 18:00", confidence: 0.6 },
  { phrase: "на неделе", meaning: "ближайшая пятница 18:00", confidence: 0.5 },
  { phrase: "к <дню недели> («к пятнице»)", meaning: "этот день 09:00", confidence: 0.6 },
  // D-52 open point closed as data: a day without a time is the end of that working day.
  { phrase: "сегодня / завтра / послезавтра без времени", meaning: "18:00 названного дня", confidence: 0.5 },
];

/** Markdown-ish table for the prompt; a row that is empty after trimming is skipped. */
export function renderConventionsTable(conventions: Convention[]): string {
  const rows = conventions
    .map((c) => ({ ...c, phrase: c.phrase.trim(), meaning: c.meaning.trim() }))
    .filter((c) => c.phrase && c.meaning);
  const lines = [
    "   | Сказано | Означает | deadline_confidence |",
    "   |---|---|---|",
    ...rows.map((c) => `   | ${c.phrase} | ${c.meaning} | ${c.confidence} |`),
    "   | явное время («к 15:00», «завтра в 10») | как сказано | 0.9–1.0 |",
  ];
  return lines.join("\n");
}
