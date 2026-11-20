import { toast } from "@/components/ui/Toast";

import {
  claimPhrase,
  dropPhrase,
  forgetParked,
  keepPhrase,
  markParked,
  patchPhrase,
  releasePhrase,
  type KeptStage,
} from "../voice/kept";
import type { RecordedAudio } from "../voice/recorder";
import type { IngestState } from "./ingest";

/** How long the face says «сохранил, отправлю сам» before it is free again (D-130). */
export const KEPT_MS = 1500;

/**
 * Whose phone keeps the phrase (D-130): the director's shell binds it once `me` is known. Not
 * state — nothing renders from it — and a phrase begun before it is known is simply not kept.
 */
let owner: string | null = null;

export function bindIngestOwner(userId: string | null): void {
  owner = userId;
}

/**
 * The phone's copy of the phrase in hand (lib/voice/kept.ts, D-130), over the ingest store's own
 * `get` and `set`: kept before anything leaves the phone, written down at every step, forgotten
 * once it is on the server, let go when another phrase takes the face, parked without network.
 * `initial` — the store's empty state, what a parked phrase leaves the face with.
 */
export function keptCopy(get: () => IngestState, set: (patch: Partial<IngestState>) => void, initial: IngestState) {
  /**
   * The phrase goes on the phone before anything else happens to it (principle 5): the
   * recording before the first byte leaves, typed words before the parser sees them.
   */
  async function keepFresh(stage: KeptStage, audio: RecordedAudio | null): Promise<void> {
    const s = get();
    const id = s.clientRequestId;
    if (!owner || !id || s.keptId) return;
    // claimed before it is written: the write wakes the replay, which must find it taken
    claimPhrase(id);
    const kept = await keepPhrase({
      id,
      userId: owner,
      createdAt: new Date().toISOString(),
      updatedAt: Date.now(),
      crid: id,
      source: s.source,
      audio: audio ? { blob: audio.blob, mime: audio.mime, durationMs: audio.durationMs } : null,
      audioPath: s.audioPath,
      inboxId: s.inboxId,
      transcript: s.transcript,
      address: s.address,
      pinned: s.pinned,
      toSecretary: s.toSecretary,
      suspicious: s.suspicious,
      stage,
      entities: [],
      parsedEntities: [],
      errand: null,
      confirm: null,
      failure: null,
      attempts: 0,
    });
    if (!kept) {
      releasePhrase(id);
      return;
    }
    // the phrase moved on while the phone wrote (a reset, another phrase): the copy is nobody's
    if (get().clientRequestId !== id) {
      releasePhrase(id);
      void dropPhrase(id);
      return;
    }
    set({ keptId: id });
  }

  /** Every step is written down: a dead app leaves the phrase where it got to. */
  function mirror(patch: Parameters<typeof patchPhrase>[1]): Promise<unknown> {
    const id = get().keptId;
    return id ? patchPhrase(id, patch) : Promise.resolve(null);
  }

  /** The phrase is over — on the server, or let go by the director: the phone forgets it. */
  function forget(): void {
    const id = get().keptId;
    if (!id) return;
    releasePhrase(id);
    forgetParked(id);
    void dropPhrase(id);
    set({ keptId: null });
  }

  /** Another phrase takes the face: the one it held is not dropped — the replay carries it on. */
  function abandon(): void {
    const id = get().keptId;
    if (id) releasePhrase(id);
  }

  /**
   * No network (D-130): the phrase stays on the phone — kept at the release, every step since
   * written down — and the replay carries it on once there is one. The face says so for a beat,
   * then is free for the next phrase. False — nothing was kept (no IndexedDB here): the old
   * «нет связи, повторить?» stays the way out.
   */
  function park(line: string): boolean {
    const id = get().keptId;
    if (!id) return false;
    releasePhrase(id);
    markParked(id);
    set({ ...initial, stage: "kept" });
    toast(line);
    setTimeout(() => {
      if (get().stage === "kept") set({ ...initial });
    }, KEPT_MS);
    return true;
  }

  return { keepFresh, mirror, forget, abandon, park };
}
