import { create } from "zustand";

import type { BlockedReason, PostprocessedEntity } from "../ai/postprocess";
import type {
  AnnouncementEntity,
  DelegationEntity,
  Entity,
  PointsEntity,
  QueryEntity,
  RecurrenceEntity,
  ReminderEntity,
  TaskEntity,
} from "../ai/schema";
import type { AssigneeMatch } from "../matchName";
import { VoiceApiError, voiceApi, type ConfirmResponse, type IngestSource } from "../voice/api";
import {
  createRecorder,
  extForMime,
  MicUnavailableError,
  type RecordedAudio,
  type Recorder,
} from "../voice/recorder";

/**
 * The director's ingest pipeline as one state machine (docs/FRONTEND.md "FAB",
 * docs/AI.md §11). Zustand holds it because it is ephemeral UI state: nothing here
 * outlives the trip to /confirm, and server state stays with TanStack Query.
 */

export type IngestStage =
  | "idle"
  | "recording"
  | "uploading"
  | "transcribing"
  | "parsing"
  | "confirm"
  | "sending"
  | "done"
  | "error";

export type IngestErrorCode =
  | "record_too_short"
  | "mic_denied"
  | "mic_unavailable"
  | "stt_failed"
  | "empty_transcript"
  | "parse_empty"
  | "parse_refused"
  | "parse_failed"
  | "ai_timeout"
  | "rate_limited"
  | "upload_failed"
  | "network"
  | "unknown";

export type RetryFrom = "upload" | "transcribe" | "parse" | "send";

export type IngestError = { code: IngestErrorCode; message?: string };

/** Patch for an entity edited on /confirm; fields are shared across kinds by name. */
export type EntityPatch = Partial<
  Omit<TaskEntity, "kind"> &
    Omit<AnnouncementEntity, "kind"> &
    Omit<PointsEntity, "kind"> &
    Omit<ReminderEntity, "kind"> &
    Omit<RecurrenceEntity, "kind"> &
    Omit<DelegationEntity, "kind"> &
    Omit<QueryEntity, "kind"> & { assignee: AssigneeMatch; blocked: BlockedReason | undefined }
>;

/** Anything shorter is a slip of the finger, not speech (docs/AI.md §11). */
export const MIN_RECORDING_MS = 1000;

const KNOWN_CODES = new Set<string>([
  "record_too_short",
  "mic_denied",
  "mic_unavailable",
  "stt_failed",
  "empty_transcript",
  "parse_empty",
  "parse_refused",
  "parse_failed",
  "ai_timeout",
  "rate_limited",
  "upload_failed",
  "network",
]);

type IngestState = {
  stage: IngestStage;
  error: IngestError | null;
  retryFrom: RetryFrom | null;
  /** Idempotency key of the whole ingest, from the first keystroke to `done` (principle 7). */
  clientRequestId: string | null;
  recordingStartedAt: number | null;
  audio: RecordedAudio | null;
  audioPath: string | null;
  inboxId: string | null;
  transcript: string;
  source: IngestSource;
  /** Editable copy shown on /confirm. */
  entities: PostprocessedEntity[];
  /** Untouched parser output — the diff behind the "share of edits" metric (D-35). */
  parsedEntities: PostprocessedEntity[];
  suspicious: boolean;
};

type IngestActions = {
  startVoice: () => Promise<void>;
  stopVoice: () => Promise<void>;
  cancelVoice: () => void;
  submitText: (text: string) => Promise<void>;
  ingestAudio: (audio: RecordedAudio) => Promise<void>;
  runTranscribe: () => Promise<void>;
  runParse: () => Promise<void>;
  startManual: () => void;
  retry: () => Promise<void>;
  editEntity: (index: number, patch: EntityPatch) => void;
  removeEntity: (index: number) => void;
  send: (forceNow?: boolean) => Promise<ConfirmResponse | null>;
  reset: () => void;
};

const initialState: IngestState = {
  stage: "idle",
  error: null,
  retryFrom: null,
  clientRequestId: null,
  recordingStartedAt: null,
  audio: null,
  audioPath: null,
  inboxId: null,
  transcript: "",
  source: "voice",
  entities: [],
  parsedEntities: [],
  suspicious: false,
};

/** The live recorder is a handle, not state: it never renders. */
let activeRecorder: Recorder | null = null;
const levelListeners = new Set<(level: number) => void>();

/** Microphone loudness, 0..1, straight to the caller — no re-render per frame. */
export function subscribeIngestLevel(cb: (level: number) => void): () => void {
  levelListeners.add(cb);
  return () => {
    levelListeners.delete(cb);
  };
}

function emitLevel(level: number) {
  for (const cb of levelListeners) cb(level);
}

function classify(cause: unknown): IngestErrorCode {
  if (cause instanceof VoiceApiError && KNOWN_CODES.has(cause.code)) {
    return cause.code as IngestErrorCode;
  }
  return "unknown";
}

function retryTargetFor(code: IngestErrorCode, from: RetryFrom): RetryFrom | null {
  // Audio survives every failure (principle 5): STT retries off the stored path.
  if (code === "stt_failed") return "transcribe";
  // A guard-rejected transcript will not improve on a re-run — the fix is to speak again.
  if (code === "empty_transcript" || code === "mic_denied" || code === "mic_unavailable") return null;
  return from;
}

/** Fields the API never sees: they are matcher output, not parser output. */
function strip(entity: PostprocessedEntity): Entity {
  const wire: Record<string, unknown> = { ...entity };
  delete wire.assignee;
  delete wire.blocked;
  return wire as unknown as Entity;
}

/** A confirmed entity carries the assignee the director actually saw on the chip. */
function toConfirmed(entity: PostprocessedEntity): Entity {
  const wire = strip(entity);
  if ("assignee_id" in wire && entity.assignee) {
    return { ...wire, assignee_id: entity.assignee.user_id ?? wire.assignee_id };
  }
  return wire;
}

/** Points are off during the pilot (G.22) and questions go to the assistant, not the batch. */
export function isCountable(entity: PostprocessedEntity): boolean {
  return entity.kind !== "query" && entity.kind !== "points";
}

export function isSendable(entity: PostprocessedEntity): boolean {
  return isCountable(entity) && entity.blocked === undefined;
}

export const useIngestStore = create<IngestState & IngestActions>((set, get) => {
  function fail(cause: unknown, from: RetryFrom) {
    const code = classify(cause);
    const body =
      cause instanceof VoiceApiError ? (cause.body as Record<string, unknown> | null) : null;
    const patch: Partial<IngestState> = {
      stage: "error",
      error: { code, message: typeof body?.message_ru === "string" ? body.message_ru : undefined },
      retryFrom: retryTargetFor(code, from),
    };
    // The server hands back whatever it managed to keep — audio path, raw transcript.
    if (typeof body?.audio_path === "string" && !get().audioPath) patch.audioPath = body.audio_path;
    if (typeof body?.transcript === "string" && !get().transcript) patch.transcript = body.transcript;
    set(patch);
  }

  return {
    ...initialState,

    async startVoice() {
      const stage = get().stage;
      if (stage !== "idle" && stage !== "error") return;

      const recorder = createRecorder();
      activeRecorder = recorder;
      recorder.onLevel(emitLevel);
      set({
        ...initialState,
        stage: "recording",
        source: "voice",
        clientRequestId: crypto.randomUUID(),
        recordingStartedAt: Date.now(),
      });

      try {
        await recorder.start();
      } catch (cause) {
        activeRecorder = null;
        set({
          stage: "error",
          error: { code: cause instanceof MicUnavailableError ? "mic_unavailable" : "mic_denied" },
          retryFrom: null,
          recordingStartedAt: null,
        });
      }
    },

    async stopVoice() {
      const recorder = activeRecorder;
      if (get().stage !== "recording" || !recorder) return;
      activeRecorder = null;

      let audio: RecordedAudio;
      try {
        audio = await recorder.stop();
      } catch {
        set({
          stage: "error",
          error: { code: "unknown" },
          retryFrom: null,
          recordingStartedAt: null,
        });
        return;
      }

      set({ recordingStartedAt: null });
      if (audio.durationMs < MIN_RECORDING_MS) {
        set({ stage: "error", error: { code: "record_too_short" }, retryFrom: null });
        return;
      }
      await get().ingestAudio(audio);
    },

    cancelVoice() {
      activeRecorder?.cancel();
      activeRecorder = null;
      set({ ...initialState });
    },

    async submitText(text) {
      const transcript = text.trim();
      if (!transcript) return;
      set({
        ...initialState,
        clientRequestId: crypto.randomUUID(),
        source: "typed",
        transcript,
      });
      await get().runParse();
    },

    async ingestAudio(audio) {
      // startVoice() normally minted the key; a retry or a hand-fed blob must not lose it.
      set({
        audio,
        stage: "uploading",
        error: null,
        retryFrom: null,
        clientRequestId: get().clientRequestId ?? crypto.randomUUID(),
      });
      try {
        const slot = await voiceApi.uploadUrl({
          ext: extForMime(audio.mime),
          context: "director_input",
          client_request_id: get().clientRequestId as string,
        });
        await voiceApi.uploadAudio({
          signed_url: slot.signed_url,
          blob: audio.blob,
          mime: audio.mime,
        });
        set({ audioPath: slot.audio_path, inboxId: slot.inbox_id ?? get().inboxId });
      } catch (cause) {
        fail(cause, "upload");
        return;
      }
      await get().runTranscribe();
    },

    async runTranscribe() {
      const { audioPath, clientRequestId } = get();
      if (!audioPath || !clientRequestId) return;
      set({ stage: "transcribing", error: null, retryFrom: null });

      try {
        const res = await voiceApi.transcribe({
          audio_path: audioPath,
          context: "director_input",
          client_request_id: clientRequestId,
          ...(get().audio ? { duration_ms: get().audio!.durationMs } : {}),
        });
        set({
          transcript: res.transcript,
          inboxId: res.inbox_id ?? get().inboxId,
          suspicious: res.suspicious ?? false,
        });
        if (!res.transcript.trim()) {
          set({ stage: "error", error: { code: "empty_transcript" }, retryFrom: null });
          return;
        }
      } catch (cause) {
        fail(cause, "transcribe");
        return;
      }
      await get().runParse();
    },

    async runParse() {
      const { transcript, audioPath, source, clientRequestId } = get();
      if (!transcript || !clientRequestId) return;
      set({ stage: "parsing", error: null, retryFrom: null });

      try {
        const res = await voiceApi.parse({
          transcript,
          audio_path: audioPath,
          source,
          client_request_id: clientRequestId,
          ...(get().suspicious ? { suspicious: true } : {}),
        });
        const entities = res.entities ?? [];
        if (res.inbox_id) set({ inboxId: res.inbox_id });
        if (res.suspicious !== undefined) set({ suspicious: res.suspicious });

        if (entities.length === 0) {
          set({ stage: "error", error: { code: "parse_empty" }, retryFrom: "parse" });
          return;
        }
        set({ entities, parsedEntities: entities, stage: "confirm", error: null, retryFrom: null });
      } catch (cause) {
        fail(cause, "parse");
      }
    },

    /** Emergency path: the model gave nothing, so the transcript becomes one task by hand. */
    startManual() {
      const transcript = get().transcript.trim();
      const manual: PostprocessedEntity = {
        kind: "task",
        assignee_queries: [],
        assignee_id: null,
        assignee_confidence: 0,
        group_id: null,
        title: transcript,
        body: null,
        deadline_iso: null,
        deadline_confidence: null,
        deadline_source_text: null,
        priority: "normal",
        scheduled_send_at: null,
        source_span: transcript,
        assignee: { status: "unmatched", user_id: null, candidates: [], flag: "check" },
        blocked: "assignee_unmatched",
      };
      set({ entities: [manual], parsedEntities: [], stage: "confirm", error: null, retryFrom: null });
    },

    async retry() {
      const { retryFrom, audio } = get();
      switch (retryFrom) {
        case "upload":
          if (audio) await get().ingestAudio(audio);
          else get().reset();
          return;
        case "transcribe":
          await get().runTranscribe();
          return;
        case "parse":
          await get().runParse();
          return;
        case "send":
          await get().send();
          return;
        default:
          get().reset();
      }
    },

    editEntity(index, patch) {
      set((state) => ({
        entities: state.entities.map((entity, i) =>
          i === index ? ({ ...entity, ...patch } as PostprocessedEntity) : entity,
        ),
      }));
    },

    removeEntity(index) {
      set((state) => ({ entities: state.entities.filter((_, i) => i !== index) }));
    },

    async send(forceNow = false) {
      const { entities, parsedEntities, transcript, audioPath, source, clientRequestId, inboxId } = get();
      const confirmed = entities.filter(isSendable).map(toConfirmed);
      if (!clientRequestId || confirmed.length === 0) return null;

      set({ stage: "sending", error: null, retryFrom: null });
      try {
        const res = await voiceApi.confirm({
          client_request_id: clientRequestId,
          source,
          audio_path: audioPath,
          transcript,
          parsed_entities: parsedEntities.map(strip),
          confirmed_entities: confirmed,
          ...(forceNow ? { force_now: true } : {}),
          ...(inboxId ? { inbox_id: inboxId } : {}),
        });
        set({ stage: "done" });
        return res;
      } catch (cause) {
        fail(cause, "send");
        return null;
      }
    },

    reset() {
      activeRecorder?.cancel();
      activeRecorder = null;
      set({ ...initialState });
    },
  };
});
