import type { BriefLine } from "./briefing";

/** The one line that states where things stand: quiet, or the verdict that opens the facts. */
const STATE_KINDS = new Set<BriefLine["kind"]>(["quiet", "verdict"]);
const QUIET_PREFIX = "Пока тихо.";
/** Said once everything the verdict opened has been dealt with. */
export const ALL_HANDLED_PREFIX = "Всё разобрано.";

function hasState(lines: BriefLine[]): boolean {
  return lines.some((line) => STATE_KINDS.has(line.kind));
}

function sameIds(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((id, i) => id === b[i]);
}

/**
 * The briefing said out loud: the lines the assistant talked through are already
 * known, so the conversation on screen is a snapshot — a handled fact fades and gets
 * a check, it is never unsaid. New facts (Realtime) join the end. The state line is
 * one slot: «Пока тихо» is not followed by «1 отказ. По порядку:» (the facts simply
 * arrive), and once every fact the verdict opened is handled, the assistant closes
 * with «Всё разобрано» instead of leaving the verdict hanging.
 */
export function mergeLines(snapshot: BriefLine[], fresh: BriefLine[]): BriefLine[] {
  if (snapshot.length === 0) return fresh;
  let changed = false;
  const byId = new Map(fresh.map((line) => [line.id, line]));
  // Facts were spoken and now nothing needs the director: the assistant closes with
  // «Всё разобрано» under the facts (appended once, then kept current), and what it said
  // before the facts («Пока тихо» or the verdict) stays as said — history is not rewritten.
  const freshQuiet = byId.get("quiet");
  const factsSpoken = snapshot.some((line) => line.kind === "fact" && line.tone !== "muted");
  const closing = freshQuiet && factsSpoken
    ? { ...freshQuiet, id: "quiet:after", text: freshQuiet.text.replace(QUIET_PREFIX, ALL_HANDLED_PREFIX) }
    : null;
  if (closing) {
    byId.delete("quiet");
    if (snapshot.some((line) => line.id === "quiet:after")) byId.set("quiet:after", closing);
  }
  const next = snapshot.map((line) => {
    const update = byId.get(line.id);
    if (!update) return line;
    if (update.text === line.text && sameIds(update.taskIds, line.taskIds)) return line;
    changed = true;
    return update;
  });

  const known = new Set(snapshot.map((line) => line.id));
  const stateSpoken = hasState(snapshot);
  for (const line of fresh) {
    if (known.has(line.id)) continue;
    if (line.kind === "greeting") continue;
    // the verdict introduces a list; after «Пока тихо» the facts speak for themselves
    if (line.kind === "verdict" && stateSpoken) continue;
    // a quiet line after facts is the closing line (added below), after a state line — nothing new
    if (line.kind === "quiet" && (closing || stateSpoken)) continue;
    next.push(line);
    changed = true;
  }
  if (closing && !known.has("quiet:after")) {
    next.push(closing);
    changed = true;
  }
  return changed ? next : snapshot;
}

/**
 * A fact is handled when nothing behind it still needs the director; a piece of news
 * («принял») is over when none of its tasks is in work any more. Both fade with a check.
 */
export function isHandled(line: BriefLine, attention: ReadonlySet<string>, open: ReadonlySet<string> | null): boolean {
  const ids = line.taskIds ?? [];
  if (ids.length === 0 || line.kind !== "fact") return false;
  if (line.tone === "muted") return open !== null && ids.every((id) => !open.has(id));
  return ids.every((id) => !attention.has(id));
}
