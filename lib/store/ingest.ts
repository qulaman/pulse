import { create } from "zustand";

import { toast } from "@/components/ui/Toast";
import { pluralRu } from "@/components/confirm/format";
import { askSecretary } from "@/lib/errands/pending";
import { firstLine, restLines } from "@/lib/notes/list";
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
import { holdUpdate } from "../update/client";
import {
  VoiceApiError,
  voiceApi,
  type ConfirmRequest,
  type ConfirmResponse,
  type IngestSource,
  type ParseResponse,
} from "../voice/api";
import {
  claimPhrase,
  dropPhrase,
  forgetParked,
  isReady,
  keepPhrase,
  markParked,
  patchPhrase,
  releasePhrase,
  type KeptPhrase,
  type KeptStage,
} from "../voice/kept";
import {
  createRecorder,
  extForMime,
  MicUnavailableError,
  type RecordedAudio,
  type Recorder,
} from "../voice/recorder";

/**
 * The director's ingest pipeline as one state machine (docs/FRONTEND.md "FAB",
 * docs/AI.md §11). Zustand holds it because it is ephemeral UI state, and server state
 * stays with TanStack Query. What must outlive the page — the phrase itself, from the
 * release to the batch on the server — is mirrored on the phone step by step
 * (lib/voice/kept.ts, D-130).
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
  /**
   * No network: the phrase stays on the phone and goes by itself once there is one (D-130).
   * A beat long — the face shows it, then the pipeline is free for the next phrase.
   */
  | "kept"
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

/** The person chosen before a word was said: the parser gets the id, not a name to guess (D-84). */
export type Pin = { id: string; name: string };

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

/** How long the face says «сохранил, отправлю сам» before it is free again (D-130). */
export const KEPT_MS = 1500;

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
  /** The phone's copy of this phrase (lib/voice/kept.ts); null — not kept (no owner, no IndexedDB). */
  keptId: string | null;
  recordingStartedAt: number | null;
  audio: RecordedAudio | null;
  audioPath: string | null;
  inboxId: string | null;
  transcript: string;
  /** The director's question when the phrase held nothing to send (stage «question»). */
  question: string | null;
  /**
   * Whom the phrase is for, when the director started it from somebody's own orb on the
   * waiting screen: «Динаре, ». It is glued to the front of the transcript before the parser
   * sees it, so the phrase he speaks can be just the task («подготовь КП до пятницы») and the
   * addressee still lands — one pipeline, no second way of assigning (D-72).
   */
  address: string | null;
  /** Whom it is for, by id — stamped on the parsed entities by the server (D-84). */
  pinned: Pin | null;
  /**
   * The phrase was said into the secretary's desk (D-99): after the words are heard it goes
   * to the secretary as the director's own request — no parser, no /confirm. The recording is
   * in Storage before anything else, as always (principle 5).
   */
  toSecretary: boolean;
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
  /**
   * `address` — «Динаре, », glued to the front of the transcript before it is parsed;
   * `pin` — the same person by id, so the parser does not have to guess who (D-84).
   */
  startVoice: (address?: string, pin?: Pin, target?: "secretary") => Promise<void>;
  stopVoice: () => Promise<void>;
  cancelVoice: () => void;
  submitText: (text: string, pin?: Pin) => Promise<void>;
  ingestAudio: (audio: RecordedAudio) => Promise<void>;
  runTranscribe: () => Promise<void>;
  runParse: () => Promise<void>;
  startManual: () => void;
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
  /**
   * A phrase the phone kept comes back to the face (D-130): its cards to confirm, or the step
   * the server refused. False — the face is busy with another phrase, or the replay holds it.
   */
  restore: (phrase: KeptPhrase) => boolean;
  reset: () => void;
};

const initialState: IngestState = {
  stage: "idle",
  error: null,
  retryFrom: null,
  clientRequestId: null,
  keptId: null,
  recordingStartedAt: null,
  audio: null,
  audioPath: null,
  inboxId: null,
  transcript: "",
  question: null,
  address: null,
  pinned: null,
  toSecretary: false,
  source: "voice",
  noteId: null,
  entities: [],
  parsedEntities: [],
  suspicious: false,
};

/** The live recorder is a handle, not state: it never renders. */
let activeRecorder: Recorder | null = null;
const levelListeners = new Set<(level: number) => void>();

/**
 * Whose phone keeps the phrase (D-130): the director's shell binds it once `me` is known. Not
 * state — nothing renders from it — and a phrase begun before it is known is simply not kept.
 */
let owner: string | null = null;

export function bindIngestOwner(userId: string | null): void {
  owner = userId;
}

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

/** A dead network, not a server that said no: the phrase can wait on the phone for the next one. */
function offline(cause: unknown): boolean {
  return cause instanceof VoiceApiError && cause.code === "network";
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
    if (res.queued) return; // no network: the phone keeps them and said so (D-130)
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

  /* ------------------------------------------------ the phone's copy (D-130) */

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
    set({ ...initialState, stage: "kept" });
    toast(line);
    setTimeout(() => {
      if (get().stage === "kept") set({ ...initialState });
    }, KEPT_MS);
    return true;
  }

  const hearLater = () =>
    get().source === "voice"
      ? "Нет связи. Запись сохранил — разберу, как появится сеть"
      : "Нет связи. Текст сохранил — разберу, как появится сеть";

  /** Said into the secretary's desk (D-99): the director's own words are the request. */
  function toDesk(): void {
    const { transcript, clientRequestId, audioPath, inboxId } = get();
    const words = transcript.trim();
    askSecretary(
      { code: "free", label: words.split(/\s+/).slice(0, 5).join(" ").slice(0, 40), icon: "" },
      words,
      () => undefined,
      { id: clientRequestId as string, audioPath, transcript: words, inboxId },
    );
    get().reset();
  }

  /**
   * What a parse means for the phrase — the live one right after the parser, and one the
   * replay parsed while nobody watched (D-130): a request to the secretary, «не разобрал»,
   * a question, thoughts only, or cards to confirm.
   */
  async function settle(
    entities: PostprocessedEntity[],
    parsed: PostprocessedEntity[],
    errand: ParseResponse["errand"] | null,
  ): Promise<void> {
    const { transcript, clientRequestId, audioPath } = get();

    // «Кофе» — заявка секретарю, а не сущность: ни /confirm, ни модели (D-79).
    // Пять секунд тост держит «Отменить», запись уже лежит в Storage (принцип 5).
    if (errand) {
      askSecretary(
        { code: errand.code, label: errand.label, icon: "" },
        errand.note,
        () => undefined,
        { id: clientRequestId as string, audioPath, transcript, inboxId: get().inboxId },
      );
      get().reset();
      return;
    }

    // nothing found: /confirm shows the raw words with a way out (fix the text, make a task, close)
    if (entities.length === 0 && parsed.length === 0) {
      set({ entities: [], parsedEntities: [], stage: "confirm", error: null, retryFrom: "parse" });
      void mirror({ stage: "parsed", entities: [], parsedEntities: [] });
      return;
    }
    // only questions: nothing to confirm — the assistant answers on Пульс
    if (parsed.length > 0 && parsed.every((entity) => entity.kind === "query")) {
      const question = parsed.map((entity) => (entity.kind === "query" ? entity.question : "")).join(" ").trim();
      forget();
      set({ entities: [], parsedEntities: parsed, question: question || transcript, stage: "question", error: null, retryFrom: null });
      return;
    }
    // only thoughts: nothing to confirm — they are already saved, «Отменить» undoes it
    if (isNotesOnly(entities)) {
      set({ entities, parsedEntities: parsed, error: null, retryFrom: null });
      void mirror({ stage: "parsed", entities, parsedEntities: parsed });
      await captureNotes();
      return;
    }
    set({ entities, parsedEntities: parsed, stage: "confirm", error: null, retryFrom: null });
    void mirror({ stage: "parsed", entities, parsedEntities: parsed });
  }

  return {
    ...initialState,

    async startVoice(address, pin, target) {
      const stage = get().stage;
      // «question» is a finished exchange on Пульс, not a busy pipeline — a new phrase may start
      if (stage !== "idle" && stage !== "error" && stage !== "question" && stage !== "kept") return;

      abandon();
      const recorder = createRecorder();
      activeRecorder = recorder;
      recorder.onLevel(emitLevel);
      set({
        ...initialState,
        stage: "recording",
        source: "voice",
        address: address ?? null,
        pinned: pin ?? null,
        toSecretary: target === "secretary",
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
      forget();
      set({ ...initialState });
    },

    async submitText(text, pin) {
      const transcript = text.trim();
      if (!transcript) return;
      abandon();
      set({
        ...initialState,
        clientRequestId: crypto.randomUUID(),
        source: "typed",
        transcript,
        pinned: pin ?? null,
      });
      await keepFresh("heard", null);
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
      // on the phone before the first byte leaves it (principle 5, D-130); a retry is kept already
      await keepFresh("recorded", audio);
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
        void mirror({ audioPath: slot.audio_path, inboxId: get().inboxId });
      } catch (cause) {
        if (offline(cause) && park(hearLater())) return;
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
        // Nothing heard: the guard threw the words away (silence the model filled in, noise) and
        // the route said so with a 200 and no transcript. Reading `.trim()` off that null used to
        // throw here, and the director got «Что-то пошло не так» for a plain «не расслышал».
        const words = typeof res.transcript === "string" ? res.transcript : "";
        // the addressee the director picked before he spoke goes in front of what he said
        const address = get().address;
        const transcript = address && words.trim() ? `${address}${words}` : words;
        set({
          transcript,
          inboxId: res.inbox_id ?? get().inboxId,
          suspicious: res.suspicious ?? false,
        });
        if (res.code === "empty_transcript" || !words.trim()) {
          // nothing was said: the audio stays in Storage, the phone has nothing left to carry
          forget();
          set({ stage: "error", error: { code: "empty_transcript" }, retryFrom: null });
          return;
        }
        void mirror({ transcript, inboxId: get().inboxId, suspicious: get().suspicious, stage: "heard" });
      } catch (cause) {
        if (offline(cause) && park(hearLater())) return;
        fail(cause, "transcribe");
        return;
      }
      await get().runParse();
    },

    async runParse() {
      const { transcript, audioPath, source, clientRequestId, pinned } = get();
      if (!transcript || !clientRequestId) return;

      // said into the secretary's desk: the director's own words are the request (D-99)
      if (get().toSecretary) {
        toDesk();
        return;
      }
      set({ stage: "parsing", error: null, retryFrom: null });

      try {
        const res = await voiceApi.parse({
          transcript,
          audio_path: audioPath,
          source,
          client_request_id: clientRequestId,
          ...(get().suspicious ? { suspicious: true } : {}),
          ...(pinned ? { assignee_id: pinned.id } : {}),
        });
        const entities = res.entities ?? [];
        if (res.inbox_id) set({ inboxId: res.inbox_id });
        if (res.suspicious !== undefined) set({ suspicious: res.suspicious });
        await settle(entities, entities, res.errand ?? null);
      } catch (cause) {
        if (offline(cause) && park(hearLater())) return;
        fail(cause, "parse");
        // «не берусь разобрать» is not a failure to retry — it is the same «nothing found» screen
        if (get().error?.code === "parse_refused") {
          set({ entities: [], parsedEntities: [], stage: "confirm", error: null, retryFrom: "parse" });
          void mirror({ stage: "parsed", entities: [], parsedEntities: [] });
        }
      }
    },

    async reparse(text) {
      const transcript = text.trim();
      if (!transcript) return;
      // corrected words are a new request: the old key would replay the empty result (principle 7)
      const clientRequestId = crypto.randomUUID();
      set({ transcript, entities: [], parsedEntities: [], question: null, clientRequestId });
      // the corrected words are the phrase now; one that was never kept (a note's) is kept from here
      if (get().keptId) void mirror({ crid: clientRequestId, transcript, stage: "heard", entities: [], parsedEntities: [], failure: null });
      else await keepFresh("heard", null);
      await get().runParse();
    },

    ask(question) {
      const text = question.trim();
      if (!text) return;
      abandon();
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
      // the person tapped before speaking is known even when the model gave nothing (D-84)
      const pinned = get().pinned;
      const manual: PostprocessedEntity = {
        kind: "task",
        assignee_queries: [],
        assignee_id: pinned?.id ?? null,
        assignee_name: pinned?.name ?? null,
        assignee_confidence: pinned ? 1 : 0,
        group_id: null,
        title: transcript,
        body: null,
        deadline_iso: null,
        deadline_confidence: null,
        deadline_source_text: null,
        priority: "normal",
        scheduled_send_at: null,
        source_span: transcript,
        ...(pinned
          ? { assignee: { status: "matched" as const, user_id: pinned.id, candidates: [], flag: "ok" as const } }
          : { assignee: { status: "unmatched" as const, user_id: null, candidates: [], flag: "check" as const }, blocked: "assignee_unmatched" as const }),
      };
      set({ entities: [manual], parsedEntities: [], stage: "confirm", error: null, retryFrom: null });
      void mirror({ stage: "parsed", entities: [manual], parsedEntities: [], failure: null });
    },

    /**
     * «Поручить» / «Объявить» on a note. The parser is not called: the text is already
     * combed, and a second parse would only invent a deadline. The entity is built by
     * hand and confirmed on the usual screen, where the director picks the assignee.
     * Not kept on the phone: the note itself is the copy.
     */
    startFromNote(note, as) {
      const text = note.text.trim();
      // a long thought reads as a task by its first line; the rest goes under it (D-81)
      const title = firstLine(text) || text;
      const body = restLines(text) || null;
      const manual: PostprocessedEntity =
        as === "task"
          ? {
              kind: "task",
              assignee_queries: [],
              assignee_id: null,
              assignee_name: null,
              assignee_confidence: 0,
              group_id: null,
              title,
              body,
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
      abandon();
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
      void mirror({ entities: get().entities });
    },

    removeEntity(index) {
      set((state) => ({ entities: state.entities.filter((_, i) => i !== index) }));
      void mirror({ entities: get().entities });
    },

    async send(forceNow = false, pointsEnabled = false) {
      const { entities, parsedEntities, transcript, audioPath, source, clientRequestId, inboxId, noteId } = get();
      const confirmed = entities.filter((entity) => isSendable(entity, pointsEnabled)).map(toConfirmed);
      if (!clientRequestId || confirmed.length === 0) return null;

      const request: ConfirmRequest = {
        client_request_id: clientRequestId,
        source,
        audio_path: audioPath,
        transcript,
        parsed_entities: parsedEntities.map(strip),
        confirmed_entities: confirmed,
        ...(forceNow ? { force_now: true } : {}),
        ...(inboxId ? { inbox_id: inboxId } : {}),
        ...(noteId ? { note_id: noteId } : {}),
      };
      set({ stage: "sending", error: null, retryFrom: null });
      try {
        const res = await voiceApi.confirm(request);
        // on the server now: the phone's copy has done its job, even if the app dies this instant
        forget();
        set({ stage: "done" });
        return res;
      } catch (cause) {
        if (offline(cause) && get().keptId) {
          // the batch waits on the phone exactly as it was thrown, under the same key: one that did
          // land and lost only its answer is a harmless duplicate on the replay (principle 7)
          await mirror({ stage: "sending", confirm: request, entities });
          if (park("Нет связи. Отправлю, как появится")) return { result: {}, duplicate: false, queued: true };
        }
        fail(cause, "send");
        return null;
      }
    },

    restore(phrase) {
      const stage = get().stage;
      if (stage !== "idle" && stage !== "error" && stage !== "question" && stage !== "kept") return false;
      if (!isReady(phrase) || !claimPhrase(phrase.id)) return false;
      abandon();
      forgetParked(phrase.id);
      set({
        ...initialState,
        keptId: phrase.id,
        clientRequestId: phrase.crid,
        source: phrase.source,
        audio: phrase.audio,
        audioPath: phrase.audioPath,
        inboxId: phrase.inboxId,
        transcript: phrase.transcript,
        address: phrase.address,
        pinned: phrase.pinned,
        toSecretary: phrase.toSecretary,
        suspicious: phrase.suspicious,
        entities: phrase.entities,
        parsedEntities: phrase.parsedEntities,
      });

      if (phrase.failure) {
        if (phrase.stage === "sending" || phrase.stage === "parsed") {
          // the batch the server refused: the cards come back to be fixed and thrown again
          set({ stage: "confirm" });
          void mirror({ stage: "parsed", confirm: null, failure: null });
          toast(phrase.failure.message ?? "Не отправилось — проверь и отправь ещё раз");
          return true;
        }
        const code: IngestErrorCode = KNOWN_CODES.has(phrase.failure.code) ? (phrase.failure.code as IngestErrorCode) : "unknown";
        const from: RetryFrom = phrase.stage === "heard" ? "parse" : phrase.audioPath ? "transcribe" : "upload";
        set({ stage: "error", error: { code, message: phrase.failure.message }, retryFrom: retryTargetFor(code, from) });
        void mirror({ failure: null, attempts: 0 });
        return true;
      }
      if (phrase.toSecretary) {
        toDesk();
        return true;
      }
      void settle(phrase.entities, phrase.parsedEntities, phrase.errand);
      return true;
    },

    reset() {
      activeRecorder?.cancel();
      activeRecorder = null;
      forget();
      set({ ...initialState });
    },
  };
});

// A phrase on its way — being recorded, uploaded, heard, parsed, or waiting on the board —
// is carried by this page: an app update waits until it is sent or dropped (D-115). The phone
// keeps a copy (D-130), but a reload in the middle would still cost the director the moment.
// «question» is a finished exchange (see startVoice), not work in progress; «kept» is on the phone.
let releaseUpdateHold: (() => void) | null = null;
useIngestStore.subscribe(({ stage }) => {
  const busy = stage !== "idle" && stage !== "done" && stage !== "question" && stage !== "kept";
  if (busy && !releaseUpdateHold) releaseUpdateHold = holdUpdate();
  if (!busy && releaseUpdateHold) {
    releaseUpdateHold();
    releaseUpdateHold = null;
  }
});
