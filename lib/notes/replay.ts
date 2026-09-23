"use client";

import { onlineManager, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useState, useSyncExternalStore } from "react";

import { toast } from "@/components/ui/Toast";
import { isNetworkError } from "@/lib/net";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { pluralRu } from "@/lib/tasks/status-text";
import { voiceApi, VoiceApiError } from "@/lib/voice/api";
import { extForMime } from "@/lib/voice/recorder";

import { insertBoard, upsertBoardCached } from "@/lib/mindboard/mutations";

import { insertNote, upsertCached } from "./mutations";
import {
  claim,
  dropBoard,
  dropCreate,
  listBoards,
  listCreates,
  listEdits,
  patchCreate,
  release,
  settleEdit,
  subscribePending,
  type PendingBoard,
  type PendingCreate,
  type PendingEdit,
} from "./pending";
import { noteKeys, type Note } from "./queries";

type Me = { userId: string; companyId: string };

/** No network, or a server that did not answer this time: keep it for the next round. */
export function isTransient(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  return error instanceof VoiceApiError && (error.code === "network" || error.status === 0 || error.status >= 500);
}

/** The object of this key is in Storage already: an earlier attempt landed, its answer was lost. */
function alreadyStored(error: unknown): boolean {
  if (!(error instanceof VoiceApiError) || error.code !== "upload_failed") return false;
  return error.status === 409 || /duplicate|already exists/i.test(JSON.stringify(error.body ?? ""));
}

/**
 * Storage first, then the row (принцип 5). Every step is keyed by the capture, so a
 * retry resumes where the last one broke and a replay of what landed changes nothing.
 */
export async function deliverCreate(me: Me, entry: PendingCreate): Promise<Note> {
  let audioPath = entry.audioPath;
  let inboxId = entry.inboxId;
  if (entry.audio && !audioPath) {
    const slot = await voiceApi.uploadUrl({ ext: extForMime(entry.audio.mime), context: "director_input", client_request_id: entry.crid });
    try {
      await voiceApi.uploadAudio({ signed_url: slot.signed_url, blob: entry.audio.blob, mime: entry.audio.mime });
    } catch (error) {
      if (!alreadyStored(error)) throw error;
    }
    audioPath = slot.audio_path;
    inboxId = slot.inbox_id ?? null;
    entry.audioPath = audioPath;
    entry.inboxId = inboxId;
    await patchCreate(entry.id, { audioPath, inboxId });
  }
  const note = await insertNote(me, {
    id: entry.id,
    text: entry.text,
    client_request_id: entry.crid,
    audio_path: audioPath,
    inbox_item_id: inboxId,
    board_id: entry.boardId ?? null,
    position: entry.position ?? null,
  });
  await dropCreate(entry.id);
  return note;
}

/** The words of a recorded note; the route writes them onto the row itself. Null — none heard, or no answer. */
export async function fetchWords(note: Note, durationMs?: number): Promise<string | null> {
  if (!note.audio_path) return null;
  try {
    const res = await voiceApi.transcribe({
      audio_path: note.audio_path,
      context: "director_input",
      client_request_id: note.client_request_id ?? crypto.randomUUID(),
      note_id: note.id,
      ...(durationMs ? { duration_ms: durationMs } : {}),
    });
    // the guard answers 200 with no transcript when the audio held no speech
    return typeof res.transcript === "string" && res.transcript.trim() ? res.transcript : null;
  } catch {
    return null;
  }
}

/** The cache learns the words at once (Realtime confirms) — unless the director typed into the empty note meanwhile. */
export function applyWords(queryClient: QueryClient, userId: string, noteId: string, words: string): void {
  const current = queryClient.getQueryData<Note[]>(noteKeys.mine(userId))?.find((row) => row.id === noteId);
  if (current && current.text.trim() === "") upsertCached(queryClient, userId, { ...current, text: words, raw_transcript: words });
}

/**
 * Notes whose words the replay is fetching right now: the card says «Распознаю…» for them,
 * as it does for the dictaphone's own — not «Не расслышал» for the three seconds of STT.
 */
let hearing: ReadonlySet<string> = new Set();
const hearingListeners = new Set<() => void>();
const NOBODY: ReadonlySet<string> = new Set();

function markHearing(id: string, on: boolean) {
  const next = new Set(hearing);
  if (on) next.add(id);
  else next.delete(id);
  hearing = next;
  for (const listener of hearingListeners) listener();
}

function subscribeHearing(listener: () => void) {
  hearingListeners.add(listener);
  return () => {
    hearingListeners.delete(listener);
  };
}

export function useReplayHearing(): ReadonlySet<string> {
  return useSyncExternalStore(
    subscribeHearing,
    () => hearing,
    () => NOBODY,
  );
}

let running: Promise<number> | null = null;

/**
 * Send what the phone kept: the notes first, oldest first, then the edits. The first
 * dead network ends the round — the rest waits for the next one. One round per tab.
 */
export function flushPendingNotes(me: Me, queryClient: QueryClient): Promise<number> {
  running ??= (async () => {
    let sent = 0;
    try {
      // boards first: a point cannot land on a board the server has not seen (D-102)
      for (const board of await listBoards(me.userId)) {
        try {
          const row = await insertBoard(me, { id: board.id, title: board.title, client_request_id: board.crid });
          upsertBoardCached(queryClient, me.userId, row);
          await dropBoard(board.id);
        } catch (error) {
          if (isTransient(error)) return sent;
          // refused for good: its points would be refused too, the board stays on the phone
        }
      }
      for (const entry of await listCreates(me.userId)) {
        // the dictaphone or a create mutation is sending this one right now
        if (!claim(entry.id)) continue;
        try {
          const note = await deliverCreate(me, entry);
          upsertCached(queryClient, me.userId, note);
          sent += 1;
          if (entry.audio && note.text.trim() === "") {
            markHearing(note.id, true);
            const words = await fetchWords(note, entry.audio.durationMs);
            markHearing(note.id, false);
            if (words) applyWords(queryClient, me.userId, note.id, words);
          }
        } catch (error) {
          if (isTransient(error)) return sent;
          // the server refused this one for good: it stays on the phone until «Удалить»
        } finally {
          release(entry.id);
        }
      }
      const supabase = createBrowserSupabase();
      for (const edit of await listEdits(me.userId)) {
        const { error } = await supabase.from("notes").update(edit.fields).eq("id", edit.id);
        if (error && isNetworkError(error)) return sent;
        // written, or refused for good (the note is gone): either way nothing is owed any more
        await settleEdit(edit.id, edit.fields);
      }
      return sent;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** While something waits on the phone, a quiet retry on this beat — `online` events lie on a captive network. */
const RETRY_MS = 30_000;

/**
 * The replay of kept notes, for the whole director app (mounted in the layout): on
 * start, when the network is back, when the app comes to the front, and on a slow beat
 * while something still waits. A note dictated at a site without signal lands by
 * itself the moment the phone finds one — on whatever screen the director is.
 */
export function useNotesReplay(me: Me | undefined) {
  const queryClient = useQueryClient();
  const userId = me?.userId;
  const companyId = me?.companyId;

  useEffect(() => {
    if (!userId || !companyId) return;
    const who = { userId, companyId };
    let alive = true;
    const round = async () => {
      if (!onlineManager.isOnline()) return;
      const sent = await flushPendingNotes(who, queryClient);
      if (alive && sent > 0) toast(`Отправил ${sent} ${pluralRu(sent, ["заметку", "заметки", "заметок"])}, что ждали связи`);
    };
    void round();
    const offOnline = onlineManager.subscribe((online) => {
      if (online) void round();
    });
    const onVisible = () => {
      if (document.visibilityState === "visible") void round();
    };
    document.addEventListener("visibilitychange", onVisible);
    const beat = setInterval(() => void round(), RETRY_MS);
    return () => {
      alive = false;
      offOnline();
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(beat);
    };
  }, [userId, companyId, queryClient]);
}

export type PendingState = { creates: PendingCreate[]; edits: PendingEdit[]; boards: PendingBoard[] };

const NOTHING: PendingState = { creates: [], edits: [], boards: [] };

/** What waits on the phone for this author — the «ждёт связи» cards and the edits laid over the feed. */
export function usePendingNotes(userId: string | undefined): PendingState {
  const [state, setState] = useState<PendingState>(NOTHING);
  useEffect(() => {
    if (!userId) return;
    let alive = true;
    const read = async () => {
      const [creates, edits, boards] = await Promise.all([listCreates(userId), listEdits(userId), listBoards(userId)]);
      if (alive) setState(creates.length === 0 && edits.length === 0 && boards.length === 0 ? NOTHING : { creates, edits, boards });
    };
    void read();
    const off = subscribePending(() => void read());
    return () => {
      alive = false;
      off();
    };
  }, [userId]);
  return userId ? state : NOTHING;
}
