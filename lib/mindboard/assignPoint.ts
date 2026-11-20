import { firstLine, restLines } from "@/lib/notes/list";
import type { Note } from "@/lib/notes/queries";

/**
 * The body «Поручить этот пункт» sends (D-177) — the very request `useAssignNote` makes from a
 * line (`lib/notes/assign.ts`): one task, the first line its title, the rest its body, the
 * recording with it, `note_id` marking what the point became. Kept here for the outbox copy of
 * the 5-second «Отменить» window (`holdForUndo`): a page closed inside the window still sends the
 * same request on the next start, and the same `client_request_id` lands once (principle 7).
 */
export const CONFIRM_PATH = "/api/voice/confirm";

export function assignBody(note: Pick<Note, "id" | "text" | "audio_path">, person: { id: string; full_name: string }, clientRequestId: string, forceNow = false) {
  const text = note.text.trim();
  return {
    client_request_id: clientRequestId,
    source: "typed" as const,
    audio_path: note.audio_path,
    transcript: text,
    parsed_entities: [],
    confirmed_entities: [
      {
        kind: "task" as const,
        assignee_queries: [],
        assignee_id: person.id,
        assignee_name: person.full_name,
        assignee_confidence: 1,
        group_id: null,
        title: firstLine(text) || text,
        body: restLines(text) || null,
        deadline_iso: null,
        deadline_confidence: null,
        deadline_source_text: null,
        priority: "normal" as const,
        scheduled_send_at: null,
        source_span: text,
      },
    ],
    note_id: note.id,
    ...(forceNow ? { force_now: true } : {}),
  };
}

/**
 * Who stands in the row of faces under «Поручить этот пункт» (D-177, owner's answer 7): the people
 * already on this board's tasks, then the latest the director gave tasks to — each once, up to
 * `limit`, never the director. Pure — tests in `assignPoint.test.ts`.
 */
export function facesFor(
  boardAssignees: readonly (string | null | undefined)[],
  sentNewestFirst: readonly { assignee_id: string | null }[],
  meId: string,
  isPerson: (id: string) => boolean,
  limit = 6,
): string[] {
  const out: string[] = [];
  const take = (id: string | null | undefined) => {
    if (!id || id === meId || out.includes(id) || !isPerson(id) || out.length >= limit) return;
    out.push(id);
  };
  for (const id of boardAssignees) take(id);
  for (const task of sentNewestFirst) take(task.assignee_id);
  return out;
}
