import { VoiceApiError, type VoiceApi } from "./api";
import { claimPhrase, dropPhrase, listPhrases, patchPhrase, releasePhrase, type KeptPhrase } from "./kept";
import { extForMime } from "./recorder";

/**
 * The replay of kept phrases (D-130): a phrase nobody is carrying — the app died on the way,
 * the network went at the release, the director threw the cards in a lift — is carried on
 * from the step it got to, under the keys minted at the tap (principle 7): the recording to
 * Storage, the words, the cards. The cards wait for the director's tap (D-36: nothing is sent
 * by itself); a batch he already threw goes to the server as it was thrown.
 */

/** Give up on a step the server keeps refusing after this many tries: the director decides. */
export const MAX_ATTEMPTS = 3;

/** No network, or a server that did not answer this time: the phrase waits for the next round. */
export function isTransient(error: unknown): boolean {
  if (!(error instanceof VoiceApiError)) return true; // a throw we cannot read is not a verdict
  return (
    error.code === "network" ||
    error.status === 0 ||
    error.status >= 500 ||
    error.code === "rate_limited" ||
    error.code === "ai_timeout"
  );
}

/** The object of this key is in Storage already: an earlier attempt landed, its answer was lost. */
function alreadyStored(error: unknown): boolean {
  if (!(error instanceof VoiceApiError) || error.code !== "upload_failed") return false;
  return error.status === 409 || /duplicate|already exists/i.test(JSON.stringify(error.body ?? ""));
}

export type ReplayDeps = {
  api: VoiceApi;
  patch: typeof patchPhrase;
  drop: typeof dropPhrase;
};

export type Outcome =
  /** The batch is on the server. */
  | "sent"
  /** The phrase waits for the director: its cards, or a failure. */
  | "ready";

/**
 * Carry one phrase as far as it can go without the director. Throws what the network or the
 * server threw; the round decides whether that is «later» or «ask the director».
 */
export async function advance(start: KeptPhrase, deps: ReplayDeps): Promise<Outcome> {
  let phrase = start;
  const step = async (patch: Parameters<typeof patchPhrase>[1]) => {
    phrase = (await deps.patch(phrase.id, patch)) ?? { ...phrase, ...patch };
  };

  if (phrase.stage === "recorded") {
    if (!phrase.audioPath) {
      if (!phrase.audio) {
        await step({ failure: { code: "upload_failed" } });
        return "ready";
      }
      // the release by the phone's clock: the server counts how long the phrase waited (D-130)
      const slot = await deps.api.uploadUrl({ ext: extForMime(phrase.audio.mime), context: "director_input", client_request_id: phrase.crid, recorded_at: phrase.createdAt });
      try {
        await deps.api.uploadAudio({ signed_url: slot.signed_url, blob: phrase.audio.blob, mime: phrase.audio.mime });
      } catch (error) {
        if (!alreadyStored(error)) throw error;
      }
      await step({ audioPath: slot.audio_path, inboxId: slot.inbox_id ?? phrase.inboxId });
    }
    const res = await deps.api.transcribe({
      audio_path: phrase.audioPath as string,
      context: "director_input",
      client_request_id: phrase.crid,
      ...(phrase.audio ? { duration_ms: phrase.audio.durationMs } : {}),
    });
    const words = typeof res.transcript === "string" ? res.transcript : "";
    if (res.code === "empty_transcript" || !words.trim()) {
      // nothing was said: the director learns it from the pill, the audio stays in Storage
      await step({ failure: { code: "empty_transcript" }, inboxId: res.inbox_id ?? phrase.inboxId });
      return "ready";
    }
    await step({
      transcript: phrase.address ? `${phrase.address}${words}` : words,
      inboxId: res.inbox_id ?? phrase.inboxId,
      suspicious: res.suspicious ?? false,
      stage: "heard",
    });
  }

  if (phrase.stage === "heard") {
    // said into the secretary's desk: the words are the request, no parser (D-99)
    if (phrase.toSecretary) {
      await step({ stage: "parsed" });
      return "ready";
    }
    let entities: KeptPhrase["entities"] = [];
    let errand: KeptPhrase["errand"] = null;
    try {
      const res = await deps.api.parse({
        transcript: phrase.transcript,
        audio_path: phrase.audioPath,
        source: phrase.source,
        client_request_id: phrase.crid,
        ...(phrase.suspicious ? { suspicious: true } : {}),
        ...(phrase.pinned ? { assignee_id: phrase.pinned.id } : {}),
      });
      entities = res.entities ?? [];
      errand = res.errand ?? null;
      if (res.inbox_id) await step({ inboxId: res.inbox_id });
    } catch (error) {
      // «не берусь разобрать» is the «nothing found» card, not a failure (as on the face)
      if (!(error instanceof VoiceApiError && error.code === "parse_refused")) throw error;
    }
    await step({ stage: "parsed", entities, parsedEntities: entities, errand });
    return "ready";
  }

  if (phrase.stage === "sending" && phrase.confirm) {
    await deps.api.confirm(phrase.confirm);
    await deps.drop(phrase.id);
    return "sent";
  }

  return "ready";
}

/** A step the server refused: tried again next round, until the director has to decide. */
async function refused(phrase: KeptPhrase, error: unknown, deps: ReplayDeps): Promise<void> {
  const code = error instanceof VoiceApiError ? error.code : "unknown";
  const body = error instanceof VoiceApiError ? (error.body as { error?: { message_ru?: unknown } } | null) : null;
  const message = typeof body?.error?.message_ru === "string" ? body.error.message_ru : undefined;
  const attempts = phrase.attempts + 1;
  // a refused batch does not get better by itself: its cards go back to the director at once
  const final = phrase.stage === "sending" || attempts >= MAX_ATTEMPTS;
  await deps.patch(phrase.id, final ? { attempts, failure: { code, ...(message ? { message } : {}) } } : { attempts });
}

export type RoundResult = { sent: number; ready: KeptPhrase[] };

/**
 * One round over the phone's phrases, oldest first. The first dead network ends the round —
 * the rest waits for the next one. `skip` — phrases somebody else carries (the face, another tab).
 */
export async function replayRound(
  userId: string,
  deps: ReplayDeps,
  options: { lock?: <T>(id: string, work: () => Promise<T>) => Promise<T | "busy"> } = {},
): Promise<RoundResult> {
  const result: RoundResult = { sent: 0, ready: [] };
  const lock = options.lock ?? (async (_id, work) => work());
  for (const phrase of await listPhrases(userId)) {
    // waits for the director: nothing to carry
    if (phrase.failure || phrase.stage === "parsed") continue;
    // the face holds it right now (the live pipeline), or this tab's last round still does
    if (!claimPhrase(phrase.id)) continue;
    try {
      const outcome = await lock(phrase.id, () => advance(phrase, deps));
      if (outcome === "sent") result.sent += 1;
      else if (outcome === "ready") {
        const now = (await listPhrases(userId)).find((p) => p.id === phrase.id);
        if (now) result.ready.push(now);
      }
    } catch (error) {
      if (isTransient(error)) return result;
      await refused(phrase, error, deps);
    } finally {
      releasePhrase(phrase.id);
    }
  }
  return result;
}

/**
 * Two tabs of the app must not carry one phrase at once (STT and the parser would be paid
 * twice): a Web Lock per phrase where the browser has them, nothing where it does not — the
 * server still dedupes the batch by its key.
 */
export async function withPhraseLock<T>(id: string, work: () => Promise<T>): Promise<T | "busy"> {
  const locks = typeof navigator !== "undefined" ? (navigator as Navigator & { locks?: LockManager }).locks : undefined;
  if (!locks?.request) return work();
  return locks.request(`pulse-phrase-${id}`, { ifAvailable: true }, async (held) => (held ? work() : "busy"));
}
