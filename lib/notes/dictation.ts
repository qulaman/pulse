"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import { MIN_RECORDING_MS } from "@/lib/store/ingest";
import { useUpdateHold } from "@/lib/update/client";
import { createRecorder, MicUnavailableError, type RecordedAudio, type Recorder } from "@/lib/voice/recorder";

import { firstLine } from "./list";
import { upsertCached } from "./mutations";
import { claim, dropCreate, keepCreate, release, type PendingCreate } from "./pending";
import type { Note } from "./queries";
import { applyWords, deliverCreate, fetchWords } from "./replay";

/**
 * The dictaphone of «Заметки» (D-81): press, speak, let go — the words become a note
 * verbatim. No parser and no «запиши мысль» preamble: on this screen everything said is
 * a note, so nothing has to be decided and nothing can be misfiled as a task.
 *
 * Order of safety (принцип 5): the recording is kept on the phone (IndexedDB, D-95),
 * then goes to Storage, then the note row is born with the recording and no words, then
 * STT writes the words onto that row on the server (the transcribe route takes
 * `note_id`). No network, a closed tab, a failed STT or a lost response — the thought
 * waits on the phone or in the feed with its voice, never gone without a trace.
 *
 * The key works two ways, like a walkie-talkie with a lock: hold it and talk — letting
 * go saves; tap it — it keeps recording until the next tap.
 */

export type DictationStage = "idle" | "recording" | "saving" | "transcribing" | "failed";

/** What the display says once a step is over — the lens takes the tone. */
export type Receipt = { tone: "ok" | "warn"; eyebrow: string; headline: string; line: string };

/** Shorter than this under the thumb is a tap: the recording locks on. */
const HOLD_MS = 350;
/** A thought, not a meeting: the key lets go by itself after five minutes. */
const MAX_MS = 5 * 60_000;

const TOO_SHORT: Receipt = { tone: "warn", eyebrow: "Не записал", headline: "Слишком коротко", line: "Держи клавишу и говори, или нажми один раз" };
const MIC_DENIED: Receipt = { tone: "warn", eyebrow: "Микрофон", headline: "Нет доступа", line: "Разреши микрофон в настройках браузера" };
const MIC_UNAVAILABLE: Receipt = { tone: "warn", eyebrow: "Микрофон", headline: "Недоступен здесь", line: "Открой приложение по https" };
const STT_FAILED: Receipt = { tone: "warn", eyebrow: "Не расслышал", headline: "Аудио сохранил", line: "Заметка в ленте — распознаю ещё раз по тапу" };
const KEPT_ON_PHONE: Receipt = { tone: "warn", eyebrow: "Нет связи", headline: "Голос на телефоне", line: "Отправлю сам, как появится связь" };

/**
 * Where the capture goes: a loose thought by default, or the next point of a board (D-102).
 * The place is taken when the recording ends, so two points said in a row keep their order.
 */
export type DictationTarget = { boardId: string; nextPosition: () => number };

type Job = {
  /** The capture as the phone keeps it: id, idempotency key, the recording, upload progress. */
  entry: PendingCreate;
  /** It is in IndexedDB: a failed delivery is the replay's job, and the key is free at once. */
  kept: boolean;
};

export function useDictation(
  me: { userId: string; companyId: string } | undefined,
  onReceipt: (receipt: Receipt) => void,
  target?: DictationTarget,
) {
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<DictationStage>("idle");
  const [latched, setLatched] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  // a recording, one on its way to the phone's store, or one that failed to get there lives
  // only in this page: an app update waits (D-115). From «transcribing» on it is in Storage.
  useUpdateHold(stage === "recording" || stage === "saving" || stage === "failed");

  const recorder = useRef<Recorder | null>(null);
  const starting = useRef<Promise<boolean>>(Promise.resolve(false));
  const pressedAt = useRef(0);
  const stopOnRelease = useRef(false);
  const job = useRef<Job | null>(null);
  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const listeners = useRef(new Set<(level: number) => void>());
  // the head's current capture; an older one finishing its STT must not reset the display
  const headNote = useRef<string | null>(null);

  const live = useRef({ me, onReceipt, target });
  useEffect(() => {
    live.current = { me, onReceipt, target };
  });

  const mark = (id: string, on: boolean) =>
    setBusy((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  async function transcribe(note: Note, durationMs?: number): Promise<void> {
    if (!note.audio_path) return;
    mark(note.id, true);
    const words = await fetchWords(note, durationMs);
    mark(note.id, false);

    const userId = live.current.me?.userId;
    if (words && userId) applyWords(queryClient, userId, note.id, words);
    if (headNote.current === note.id) {
      headNote.current = null;
      setStage((now) => (now === "transcribing" ? "idle" : now));
    }
    live.current.onReceipt(
      words ? { tone: "ok", eyebrow: "Записал", headline: firstLine(words), line: "Сохранено слово в слово" } : STT_FAILED,
    );
  }

  /** Phone → Storage → note row → STT. Every step is keyed, so a retry resumes where it broke. */
  async function deliver(): Promise<void> {
    const current = job.current;
    const me = live.current.me;
    if (!current || !me) return;
    setStage("saving");
    let note: Note;
    try {
      note = await deliverCreate(me, current.entry);
    } catch {
      if (current.kept) {
        // on the phone: the replay sends it when the network is back (the feed shows it as
        // «ждёт связи»), and the dictaphone is free for the next thought right now
        release(current.entry.id);
        job.current = null;
        setStage("idle");
        live.current.onReceipt(KEPT_ON_PHONE);
        return;
      }
      // kept in memory only (no IndexedDB here): the display offers «Повторить»
      setStage("failed");
      return;
    }
    release(current.entry.id);
    job.current = null;
    upsertCached(queryClient, me.userId, note);
    headNote.current = note.id;
    setStage("transcribing");
    await transcribe(note, current.entry.audio?.durationMs);
  }

  async function begin(): Promise<void> {
    if (recorder.current || !live.current.me) return;
    const rec = createRecorder();
    recorder.current = rec;
    rec.onLevel((level) => {
      for (const cb of listeners.current) cb(level);
    });
    setStage("recording");
    setLatched(false);
    setStartedAt(Date.now());
    starting.current = rec.start().then(
      () => true,
      (cause) => {
        if (recorder.current === rec) recorder.current = null;
        setStage("idle");
        setStartedAt(null);
        live.current.onReceipt(cause instanceof MicUnavailableError ? MIC_UNAVAILABLE : MIC_DENIED);
        return false;
      },
    );
    if (await starting.current) {
      // the clock starts when the microphone does, not when the permission prompt did
      setStartedAt(Date.now());
      cap.current = setTimeout(() => void finish(), MAX_MS);
    }
  }

  async function finish(): Promise<void> {
    const rec = recorder.current;
    if (!rec) return;
    if (cap.current) clearTimeout(cap.current);
    // a release during the permission prompt waits for the microphone to open
    if (!(await starting.current) || recorder.current !== rec) return;
    recorder.current = null;
    setLatched(false);
    setStartedAt(null);

    let audio: RecordedAudio;
    try {
      audio = await rec.stop();
    } catch {
      setStage("idle");
      return;
    }
    if (audio.durationMs < MIN_RECORDING_MS) {
      setStage("idle");
      live.current.onReceipt(TOO_SHORT);
      return;
    }
    const me = live.current.me;
    if (!me) return;
    const place = live.current.target;
    const entry: PendingCreate = {
      id: crypto.randomUUID(),
      userId: me.userId,
      companyId: me.companyId,
      crid: crypto.randomUUID(),
      text: "",
      createdAt: new Date().toISOString(),
      audio: { blob: audio.blob, mime: audio.mime, durationMs: audio.durationMs },
      audioPath: null,
      inboxId: null,
      boardId: place?.boardId ?? null,
      position: place ? place.nextPosition() : null,
    };
    // this capture is the dictaphone's until it lands or is handed over to the replay
    claim(entry.id);
    job.current = { entry, kept: await keepCreate(entry) };
    await deliver();
  }

  // leaving the screen mid-sentence saves what was said instead of dropping it (принцип 5)
  const finishRef = useRef(finish);
  useEffect(() => {
    finishRef.current = finish;
  });
  useEffect(() => {
    const timer = cap;
    return () => {
      if (timer.current) clearTimeout(timer.current);
      if (recorder.current) void finishRef.current();
    };
  }, []);

  return {
    stage,
    latched,
    /** When the microphone opened; null while it is not recording. */
    startedAt,
    /** Notes whose words are on their way from STT right now. */
    busy,

    /** Key down: starts a recording, or arms the stop of a locked one. */
    press() {
      if (recorder.current) {
        stopOnRelease.current = true;
        return;
      }
      if (stage === "saving" || stage === "failed") return;
      stopOnRelease.current = false;
      pressedAt.current = Date.now();
      void begin();
    },

    /** Key up: a hold saves, a tap locks the recording on. */
    release() {
      if (!recorder.current) return;
      if (stopOnRelease.current) {
        stopOnRelease.current = false;
        void finish();
      } else if (Date.now() - pressedAt.current >= HOLD_MS) void finish();
      else setLatched(true);
    },

    /** Enter or Space on the key: no hold on a keyboard, so it is always a toggle. */
    toggle() {
      if (recorder.current) {
        void finish();
        return;
      }
      if (stage === "saving" || stage === "failed") return;
      void begin().then(() => undefined);
      setLatched(true);
    },

    /** «Отмена» while recording: nothing is kept — the only way a recording is dropped on purpose. */
    cancel() {
      if (cap.current) clearTimeout(cap.current);
      recorder.current?.cancel();
      recorder.current = null;
      setStage("idle");
      setLatched(false);
      setStartedAt(null);
    },

    /** «Повторить» after the recording failed to reach Storage or the table. */
    retry() {
      if (job.current) void deliver();
    },

    /** «Удалить запись» after a failed delivery: the director gives up on it explicitly. */
    discard() {
      if (job.current) {
        release(job.current.entry.id);
        void dropCreate(job.current.entry.id);
      }
      job.current = null;
      setStage("idle");
    },

    /** «Распознать ещё раз» on a note whose STT failed. */
    retranscribe(note: Note) {
      if (!busy.has(note.id)) void transcribe(note);
    },

    /** Microphone loudness 0..1 straight to the caller — no re-render per frame. */
    subscribeLevel(cb: (level: number) => void) {
      listeners.current.add(cb);
      return () => {
        listeners.current.delete(cb);
      };
    },
  };
}

export type Dictation = ReturnType<typeof useDictation>;
