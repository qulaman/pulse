import { announcementKind } from "./announcement";
import { eventKind } from "./event";
import type { KindModule } from "./fields";
import { normalizeKinds, PARSER_KINDS, type ParserKind } from "./names";
import { noteKind } from "./note";
import { pointsKind } from "./points";
import { queryKind } from "./query";
import { recurrenceKind } from "./recurrence";
import { reminderKind } from "./reminder";
import { taskKind } from "./task";

/**
 * The parser assembled from kinds (task 026): the prompt, the few-shot and the model's schema
 * are each the modules of the kinds a company has on (settings.parser.kinds), in one fixed
 * order. All eight together are the default — and the eight variants the Claude grammar
 * holds (schema.ts).
 */
export const KIND_MODULES: readonly KindModule[] = [
  announcementKind,
  taskKind,
  pointsKind,
  reminderKind,
  noteKind,
  eventKind,
  recurrenceKind,
  queryKind,
];

/** The modules of the kinds that are on, in the fixed order; `task` is always among them. */
export function kindModules(kinds: readonly ParserKind[] = PARSER_KINDS): KindModule[] {
  const on = new Set(normalizeKinds(kinds));
  return KIND_MODULES.filter((module) => on.has(module.kind));
}
