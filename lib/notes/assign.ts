"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError, NetworkError } from "@/lib/net";
import { shortName } from "@/lib/people/names";
import { pluralRu } from "@/lib/tasks/status-text";
import { voiceApi, VoiceApiError } from "@/lib/voice/api";

import { firstLine, restLines } from "./list";
import { noteKeys, type Note } from "./queries";

/**
 * «Поручить» on a note or a board's point (D-108): the director picks a person in the sheet
 * and the task is sent from where they stand — no trip to /confirm. The pick is the
 * confirmation (D-36 holds: nothing leaves without the director's tap on a name).
 *
 * The same RPC as every batch — `confirm_voice_batch` through `/api/voice/confirm` — with
 * one task: the first line is the title, the rest the body (D-81), the recording of the
 * thought follows it (принцип 5), `note_id` marks what the note became (D-75 §5). Outside
 * the delivery window the task waits for the morning like any other (D-38), unless the
 * director asked «сразу». Online only: a task handed out «later» is worse than an honest
 * «нет связи», and the note keeps its button.
 */

/**
 * `client_request_id` is minted with the pick, not per attempt: a retry after a lost answer —
 * the hook's own or the next tap on «Поручить» — lands on the task already made (принцип 7).
 */
export type AssignInput = { note: Note; person: { id: string; full_name: string }; forceNow: boolean; client_request_id: string };

export type AssignResult = { taskId: string | null; scheduled: boolean };

/** One task from one line: the pick's idempotency key, its note marked by `note_id`. */
async function sendAssign({ note, person, forceNow, client_request_id }: AssignInput): Promise<AssignResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError();
  const text = note.text.trim();
  const res = await voiceApi.confirm({
    client_request_id,
    source: "typed",
    audio_path: note.audio_path,
    transcript: text,
    parsed_entities: [],
    confirmed_entities: [
      {
        kind: "task",
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
        priority: "normal",
        scheduled_send_at: null,
        source_span: text,
      },
    ],
    note_id: note.id,
    ...(forceNow ? { force_now: true } : {}),
  });
  const ids = (res.result.task_ids as string[] | null | undefined) ?? [];
  return { taskId: ids[0] ?? null, scheduled: res.result.scheduled === true };
}

/** The note turns into «В деле» / «→ Марат» at once; Realtime confirms the same row. */
function markHanded(queryClient: QueryClient, userId: string, noteId: string, taskId: string) {
  const convertedAt = new Date().toISOString();
  queryClient.setQueryData<Note[]>(noteKeys.mine(userId), (rows) =>
    (rows ?? []).map((row) => (row.id === noteId ? { ...row, converted_task_id: taskId, converted_at: convertedAt } : row)),
  );
}

function offline(error: unknown): boolean {
  return isNetworkError(error) || (error instanceof VoiceApiError && (error.code === "network" || error.status === 0));
}

export function useAssignNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    // the pick is an answer now, not a wish queued for later
    networkMode: "always",
    mutationFn: sendAssign,
    onSuccess: (result, { note, person }) => {
      if (me && result.taskId) markHanded(queryClient, me.userId, note.id, result.taskId);
      const who = shortName(person.full_name);
      toast(result.scheduled ? `Поручено: ${who} · получит утром` : `Поручено: ${who}`);
    },
    onError: (error) => {
      if (offline(error)) {
        toast("Нет связи — не поручил, попробуйте ещё раз");
        return;
      }
      toast("Не получилось поручить. Попробуйте ещё раз");
    },
  });
}

export type AssignManyResult = { sent: AssignInput[]; failed: AssignInput[]; scheduled: boolean };

/**
 * «Раздать поручения» (D-140): after the briefing every point gets its person and one tap
 * sends them all — one task per point, one after another, each with its own key, each line
 * marked the moment its task exists. One toast for the lot; what did not go stays on the
 * board with its pick, ready for the next tap.
 */
export function useAssignNotes(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    networkMode: "always",
    retry: false,
    mutationFn: async (inputs: AssignInput[]): Promise<AssignManyResult> => {
      const sent: AssignInput[] = [];
      const failed: AssignInput[] = [];
      let scheduled = false;
      for (const [index, input] of inputs.entries()) {
        try {
          const result = await sendAssign(input);
          if (me && result.taskId) markHanded(queryClient, me.userId, input.note.id, result.taskId);
          scheduled ||= result.scheduled;
          sent.push(input);
        } catch (error) {
          failed.push(input);
          // no network: the rest would fail the same way — keep them for the next tap
          if (offline(error)) {
            failed.push(...inputs.slice(index + 1));
            break;
          }
        }
      }
      return { sent, failed, scheduled };
    },
    onSuccess: ({ sent, failed, scheduled }) => {
      const names = [...new Set(sent.map((input) => shortName(input.person.full_name)))].join(", ");
      if (sent.length === 0) {
        toast("Не получилось поручить. Попробуйте ещё раз");
        return;
      }
      const head = `Поручено ${sent.length} ${pluralRu(sent.length, ["пункт", "пункта", "пунктов"])}: ${names}`;
      if (failed.length > 0) toast(`${head} · ${failed.length} не ушли — попробуйте ещё раз`);
      else toast(scheduled ? `${head} · получат утром` : head);
    },
  });
}
