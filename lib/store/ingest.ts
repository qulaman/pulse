import { create } from "zustand";

import { toast } from "@/components/ui/Toast";
import { pluralRu } from "@/components/confirm/format";
import { softDeleteNotes } from "@/lib/notes/mutations";
import type { BlockedReason, ParticipantMatch, PostprocessedEntity } from "../ai/postprocess";
import type {
  AnnouncementEntity,
  DelegationEntity,
  Entity,
  EventEntity,
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
  /** The phrase was a question, not an order: the assistant answers it on Пульс. */
  | "question"
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
    Omit<QueryEntity, "kind"> &
    Omit<EventEntity, "kind"> & {
      assignee: AssigneeMatch;
      participants: ParticipantMatch[];
      blocked: BlockedReason | undefined;
    }
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
  /** The director's question when the phrase held nothing to send (stage «question»). */
  question: string | null;
  source: IngestSource;
  /** The note «Поручить»/«Объявить» started from: the RPC marks it converted (D-75 §5). */
  noteId: string | null;
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
  startManualEvent: () => void;
  /** A note the director hands out: one entity built by hand, then the usual confirm screen. */
  startFromNote: (
    note: { id: string; text: string; audio_path: string | null },
    as: "task" | "announcement",
  ) => void;
  /** The director corrected the transcript by hand: parse it again, same request. */
  reparse: (text: string) => Promise<void>;
  /** Hand a question to the assistant on Пульс (a query-only phrase, or the questions of a sent batch). */
  ask: (question: string) => void;
  retry: () => Promise<void>;
  editEntity: (index: number, patch: EntityPatch) => void;
  removeEntity: (index: number) => void;
  send: (forceNow?: boolean, pointsEnabled?: boolean) => Promise<ConfirmResponse | null>;
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
  question: null,
  source: "voice",
  noteId: null,
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
  delete wire.participants;
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

/** Questions go to the assistant, not the batch; points count only once the company switched them on (D-48). */
export function isCountable(entity: PostprocessedEntity, pointsEnabled = false): boolean {
  if (entity.kind === "query") return false;
  if (entity.kind === "points") return pointsEnabled;
  return true;
}

/**
 * The «Кто» chip of an event card: «Все» / «Только я» / «Марат, Айгуль» / «Марат +2».
 * The author is always in the meeting, so an empty list is not «nobody» but «only me».
 */
export function describeParticipants(
  entity: { everyone: boolean; participant_ids: string[] },
  nameOf: (id: string) => string | undefined,
): string {
  if (entity.everyone) return "Все";
  const names = entity.participant_ids.map((id) => nameOf(id) ?? "?");
  if (names.length === 0) return "Только я";
  if (names.length <= 2) return names.join(", ");
  return `${names[0]} +${names.length - 1}`;
}

export function isSendable(entity: PostprocessedEntity, pointsEnabled = false): boolean {
  return isCountable(entity, pointsEnabled) && entity.blocked === undefined;
}

/**
 * A phrase that held nothing but thoughts needs no confirm screen (D-75 §3): there is
 * no assignee to pick and no deadline to check, so the note is saved straight away and
 * the toast offers «Отменить». An empty parse is not «notes only» — that is the
 * «ничего не нашёл» screen.
 */
export function isNotesOnly(entities: PostprocessedEntity[]): boolean {
  return entities.length > 0 && entities.every((entity) => entity.kind === "note");
}

/** note_ids of the batch — what «Отменить» in the toast soft-deletes. */
function noteIdsOf(result: Record<string, unknown>): string[] {
  const ids = result.note_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export const useIngestStore = create<IngestState & IngestActions>((set, get) => {
  /**
   * A phrase of nothing but thoughts (D-75 §3): send it, say «Записал» with a way back,
   * and free the pipeline. Shared by the parse path and «повторить» after a failed
   * send — the retry must not sit at stage «done» with no toast.
   */
  async function captureNotes(): Promise<void> {
    const count = get().entities.length;
    const res = await get().send(false, false);
    if (!res) return; // send() already left the overlay on «повторить»
    const ids = noteIdsOf(res.result);
    toast(
      count === 1 ? "Записал" : `Записал ${count} ${pluralRu(count, ["заметку", "заметки", "заметок"])}`,
      ids.length > 0 ? { action: { label: "Отменить", onClick: () => void softDeleteNotes(ids) } } : undefined,
    );
    get().reset();
  }

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
      // «question» is a finished exchange on Пульс, not a busy pipeline — a new phrase may start
      if (stage !== "idle" && stage !== "error" && stage !== "question") return;

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

        // nothing found: /confirm shows the raw words with a way out (fix the text, make a task, close)
        if (entities.length === 0) {
          set({ entities: [], parsedEntities: [], stage: "confirm", error: null, retryFrom: "parse" });
          return;
        }
        // only questions: nothing to confirm — the assistant answers on Пульс
        if (entities.every((entity) => entity.kind === "query")) {
          const question = entities.map((entity) => (entity.kind === "query" ? entity.question : "")).join(" ").trim();
          set({ entities: [], parsedEntities: entities, question: question || transcript, stage: "question", error: null, retryFrom: null });
          return;
        }
        // only thoughts: nothing to confirm — they are already saved, «Отменить» undoes it
        if (isNotesOnly(entities)) {
          set({ entities, parsedEntities: entities, error: null, retryFrom: null });
          await captureNotes();
          return;
        }
        set({ entities, parsedEntities: entities, stage: "confirm", error: null, retryFrom: null });
      } catch (cause) {
        fail(cause, "parse");
        // «не берусь разобрать» is not a failure to retry — it is the same «nothing found» screen
        if (get().error?.code === "parse_refused") {
          set({ entities: [], parsedEntities: [], stage: "confirm", error: null, retryFrom: "parse" });
        }
      }
    },

    async reparse(text) {
      const transcript = text.trim();
      if (!transcript) return;
      // corrected words are a new request: the old key would replay the empty result (principle 7)
      set({ transcript, entities: [], parsedEntities: [], question: null, clientRequestId: crypto.randomUUID() });
      await get().runParse();
    },

    ask(question) {
      const text = question.trim();
      if (!text) return;
      set({
        ...initialState,
        clientRequestId: get().clientRequestId ?? crypto.randomUUID(),
        source: get().source,
        transcript: text,
        question: text,
        stage: "question",
      });
    },

    /** Emergency path: the model gave nothing, so the transcript becomes one task by hand. */
    startManual() {
      const transcript = get().transcript.trim();
      const manual: PostprocessedEntity = {
        kind: "task",
        assignee_queries: [],
        assignee_id: null,
        assignee_name: null,
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

    /**
     * «+» on /calendar: the same confirm screen, started from an empty meeting card.
     * There is no second way to create an event — one parser, one screen (principle 1).
     */
    startManualEvent() {
      const transcript = get().transcript.trim();
      const manual: PostprocessedEntity = {
        kind: "event",
        title: transcript,
        body: null,
        location: null,
        starts_at_iso: null,
        ends_at_iso: null,
        time_confidence: null,
        time_source_text: null,
        participant_queries: [],
        participant_names: [],
        participant_ids: [],
        everyone: false,
        remind_before_min: null,
        source_span: transcript,
        participants: [],
        blocked: "time_missing",
      };
      set({
        ...initialState,
        clientRequestId: crypto.randomUUID(),
        source: "typed",
        transcript,
        entities: [manual],
        parsedEntities: [],
        stage: "confirm",
      });
    },

    /**
     * «Поручить» / «Объявить» on a note. The parser is not called: the text is already
     * combed, and a second parse would only invent a deadline. The entity is built by
     * hand and confirmed on the usual screen, where the director picks the assignee.
     */
    startFromNote(note, as) {
      const text = note.text.trim();
      const manual: PostprocessedEntity =
        as === "task"
          ? {
              kind: "task",
              assignee_queries: [],
              assignee_id: null,
              assignee_name: null,
              assignee_confidence: 0,
              group_id: null,
              title: text,
              body: null,
              deadline_iso: null,
              deadline_confidence: null,
              deadline_source_text: null,
              priority: "normal",
              scheduled_send_at: null,
              source_span: text,
              assignee: { status: "unmatched", user_id: null, candidates: [], flag: "check" },
              blocked: "assignee_unmatched",
            }
          : { kind: "announcement", text, source_span: text };
      set({
        ...initialState,
        clientRequestId: crypto.randomUUID(),
        source: "typed",
        transcript: text,
        // the recording of the thought follows it into the task (principle 5)
        audioPath: note.audio_path,
        noteId: note.id,
        stage: "confirm",
        entities: [manual],
        parsedEntities: [],
      });
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
          // a notes-only batch must end the same way it would have from the parse path
          if (isNotesOnly(get().entities)) await captureNotes();
          else await get().send();
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

    async send(forceNow = false, pointsEnabled = false) {
      const { entities, parsedEntities, transcript, audioPath, source, clientRequestId, inboxId, noteId } = get();
      const confirmed = entities.filter((entity) => isSendable(entity, pointsEnabled)).map(toConfirmed);
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
          ...(noteId ? { note_id: noteId } : {}),
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
