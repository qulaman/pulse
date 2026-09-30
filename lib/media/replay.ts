import { isNetworkError } from "@/lib/net";
import { VoiceApiError } from "@/lib/voice/api";

import { claimMedia, dropMedia, listMedia, patchMedia, releaseMedia, type PendingMedia } from "./pending";

/**
 * The replay of the files a person's phone kept (D-130): a voice message or a photo of a
 * thread, a report with a photo. Storage first, then the row, under the keys minted at the
 * tap — a replay of something that did land changes nothing (principle 7).
 */

/** A step the server keeps refusing is given up after this many rounds — and the person is told. */
export const MAX_MEDIA_ATTEMPTS = 3;

export type MessageRow = {
  id: string;
  task_id: string;
  company_id: string;
  sender_id: string;
  type: "voice" | "photo";
  content: string | null;
  file_path: string;
  meta: Record<string, unknown>;
};

export type MediaDeps = {
  /** The file into Storage under `item.crid`; resolves to its path. */
  upload: (item: PendingMedia) => Promise<string>;
  insertMessage: (row: MessageRow) => Promise<{ error: { message: string } | null }>;
  /** «Выполнено» with the photo inside (transition_task, D-64 §3): the HTTP status and the server's words. */
  handIn: (item: PendingMedia, filePath: string) => Promise<{ status: number; message?: string }>;
};

export type MediaOutcome = { kind: "sent" } | { kind: "refused"; message: string };

/** No network, a server that did not answer this time, or a lost session: try again later. */
export function isTransientMedia(error: unknown): boolean {
  if (isNetworkError(error)) return true;
  if (error instanceof VoiceApiError) return error.code === "network" || error.status === 0 || error.status >= 500 || error.code === "rate_limited";
  if (error instanceof TransientError) return true;
  return error instanceof Error && /\((5\d\d|401|429)\)/.test(error.message);
}

class TransientError extends Error {}

function rowOf(item: PendingMedia, filePath: string, type: "voice" | "photo"): MessageRow {
  return {
    id: item.id,
    task_id: item.taskId,
    company_id: item.companyId,
    sender_id: item.userId,
    type,
    content: item.text.trim() || null,
    file_path: filePath,
    meta: item.kind === "voice" && item.durationMs ? { duration_ms: item.durationMs } : {},
  };
}

/** Carry one file to the server. Throws what the network threw; the round decides «later» or «give up». */
export async function deliverMedia(item: PendingMedia, deps: MediaDeps): Promise<MediaOutcome> {
  let filePath = item.filePath;
  if (!filePath) {
    filePath = await deps.upload(item);
    await patchMedia(item.id, { filePath });
  }

  if (item.kind === "report") {
    const res = await deps.handIn(item, filePath);
    if (res.status >= 200 && res.status < 300) return { kind: "sent" };
    if (res.status === 0 || res.status === 401 || res.status >= 500) throw new TransientError(`hand in (${res.status})`);
    // the task moved on while the phone waited (the director took it back, closed it): the
    // work photo and the words still reach the thread — nothing the person made is lost
    const { error } = await deps.insertMessage(rowOf(item, filePath, "photo"));
    if (error && isNetworkError(error)) throw new TransientError(error.message);
    return { kind: "refused", message: res.message ?? "задача уже изменилась" };
  }

  const { error } = await deps.insertMessage(rowOf(item, filePath, item.kind));
  // a duplicate id is the row that did land — only its answer was lost
  if (!error || /duplicate key/i.test(error.message)) return { kind: "sent" };
  if (isNetworkError(error)) throw new TransientError(error.message);
  return { kind: "refused", message: item.kind === "voice" ? "голосовое не прошло" : "фото не прошло" };
}

export type MediaRoundResult = { sent: number; refused: string[] };

/**
 * One round over this person's files, oldest first. The first dead network ends the round; a
 * refusal that is not about the network is tried again next round and given up after
 * MAX_MEDIA_ATTEMPTS — with the person told, never silently.
 */
export async function mediaRound(userId: string, deps: MediaDeps): Promise<MediaRoundResult> {
  const result: MediaRoundResult = { sent: 0, refused: [] };
  for (const item of await listMedia(userId)) {
    // the composer is sending this one right now
    if (!claimMedia(item.id)) continue;
    try {
      const outcome = await deliverMedia(item, deps);
      await dropMedia(item.id);
      if (outcome.kind === "sent") result.sent += 1;
      else result.refused.push(outcome.message);
    } catch (error) {
      if (isTransientMedia(error)) return result;
      const attempts = item.attempts + 1;
      if (attempts >= MAX_MEDIA_ATTEMPTS) {
        await dropMedia(item.id);
        result.refused.push(item.kind === "voice" ? "голосовое не прошло" : item.kind === "photo" ? "фото не прошло" : "отчёт с фото не прошёл");
      } else {
        await patchMedia(item.id, { attempts });
      }
    } finally {
      releaseMedia(item.id);
    }
  }
  return result;
}
