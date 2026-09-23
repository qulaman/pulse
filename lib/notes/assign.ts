"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { isNetworkError, NetworkError } from "@/lib/net";
import { firstNameOf } from "@/lib/people/roster";
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

export type AssignInput = { note: Note; person: { id: string; full_name: string }; forceNow: boolean };

export type AssignResult = { taskId: string | null; scheduled: boolean };

export function useAssignNote(me: { userId: string } | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    // the pick is an answer now, not a wish queued for later
    networkMode: "always",
    mutationFn: async ({ note, person, forceNow }: AssignInput): Promise<AssignResult> => {
      if (typeof navigator !== "undefined" && !navigator.onLine) throw new NetworkError();
      const text = note.text.trim();
      const res = await voiceApi.confirm({
        client_request_id: crypto.randomUUID(),
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
    },
    onSuccess: (result, { note, person }) => {
      // the note turns into «В деле» / «→ Марат» at once; Realtime confirms the same row
      if (me && result.taskId) {
        const convertedAt = new Date().toISOString();
        queryClient.setQueryData<Note[]>(noteKeys.mine(me.userId), (rows) =>
          (rows ?? []).map((row) => (row.id === note.id ? { ...row, converted_task_id: result.taskId, converted_at: convertedAt } : row)),
        );
      }
      const who = firstNameOf(person.full_name);
      toast(result.scheduled ? `Поручено: ${who} · получит утром` : `Поручено: ${who}`);
    },
    onError: (error) => {
      if (isNetworkError(error) || (error instanceof VoiceApiError && (error.code === "network" || error.status === 0))) {
        toast("Нет связи — не поручил, попробуйте ещё раз");
        return;
      }
      toast("Не получилось поручить. Попробуйте ещё раз");
    },
  });
}
