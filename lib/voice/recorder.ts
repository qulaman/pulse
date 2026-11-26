import type { AudioExt } from "./api";

/**
 * MediaRecorder wrapper for the director's FAB (docs/FRONTEND.md "Аудио").
 * One blob is produced on release; chunk streaming via timeslice is the next work order
 * (G.23). Raw microphone input — the STT gate was won on unprocessed audio.
 */

export type RecordedAudio = {
  blob: Blob;
  mime: string;
  durationMs: number;
  /**
   * The loudest sample of the whole recording, 0..1 — or undefined when the page could not measure
   * all of it (no Web Audio, a suspended AudioContext, a window hidden or a frame stalled on the
   * way — animation frames stop there): unknown is never «silent».
   */
  peak?: number;
};

/**
 * Below this for the whole recording (−54 dBFS) there was no voice at all: a microphone muted in
 * the system, the wrong input chosen, another program holding it. Any speech peaks far above it,
 * a quiet room's own noise too; only a dead input stays under. Such a recording is not sent to the
 * recogniser — on silence it invents a phrase out of the names and words of its hint (2026-11-17).
 */
export const SILENT_PEAK = 0.002;

/** Measured, and nothing came through the microphone. */
export function isSilent(audio: Pick<RecordedAudio, "peak">): boolean {
  return audio.peak !== undefined && audio.peak < SILENT_PEAK;
}

/** Fewer measured frames than this (about 0.2 s) say nothing about the input. */
const MEASURED_TICKS = 12;
/** A gap between two measured frames longer than this: the window was hidden, the measure broke. */
const MEASURE_GAP_MS = 500;
/** The measured frames must span this share of the recording. */
const MEASURE_SPAN = 0.8;

export type Recorder = {
  start(): Promise<void>;
  stop(): Promise<RecordedAudio>;
  cancel(): void;
  onLevel(cb: (level: number) => void): () => void;
};

/** iOS Safari plays neither webm nor opus — mp4/AAC first (docs/FRONTEND.md). */
const MIME_CANDIDATES = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"] as const;

const AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  noiseSuppression: false,
  echoCancellation: false,
  autoGainControl: false,
};

export function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return MIME_CANDIDATES[0];
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "";
}

/** Storage extension for a recorded mimeType (docs/BACKEND.md §2 upload-url). */
export function extForMime(mime: string): AudioExt {
  return mime.startsWith("audio/mp4") ? "m4a" : "webm";
}

/** Thrown by start() when the page cannot ask for a microphone at all. */
export class MicUnavailableError extends Error {
  constructor() {
    super("microphone API is unavailable: insecure context or unsupported browser");
    this.name = "MicUnavailableError";
  }
}

/**
 * Thrown by start() when stop() or cancel() came while the browser was still opening the
 * microphone: the stream it hands over afterwards is released at once, nothing records.
 */
export class RecordingDroppedError extends Error {
  constructor() {
    super("the recording was stopped before the microphone opened");
    this.name = "RecordingDroppedError";
  }
}

export function createRecorder(): Recorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let rafId: number | null = null;
  let startedAt = 0;
  // getUserMedia is in flight, and whether stop()/cancel() came meanwhile: the stream that arrives
  // after them has no owner — it must be closed on arrival, or the microphone stays on (2026-11-26)
  let opening = false;
  let dropped = false;
  // the loudest sample seen, and how many frames were measured with the audio clock running
  let peak = 0;
  let measured = 0;
  let firstTick = 0;
  let lastTick = 0;
  let broken = false;
  const chunks: Blob[] = [];
  const listeners = new Set<(level: number) => void>();

  function teardown() {
    if (rafId !== null) cancelAnimationFrame(rafId);
    rafId = null;
    void audioContext?.close().catch(() => {});
    audioContext = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  /**
   * Loudness for the pulsing ring: RMS of the time-domain buffer, 0..1. The same frames give the
   * recording's peak — floats where the browser has them (a byte is 1/128, too coarse for −54 dB).
   */
  function meter(source: MediaStream) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    audioContext = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    ctx.createMediaStreamSource(source).connect(analyser);
    const floats = typeof analyser.getFloatTimeDomainData === "function" ? new Float32Array(analyser.fftSize) : null;
    const bytes = new Uint8Array(analyser.fftSize);

    const tick = () => {
      let sum = 0;
      let top = 0;
      if (floats) {
        analyser.getFloatTimeDomainData(floats);
        for (const value of floats) {
          sum += value * value;
          const size = Math.abs(value);
          if (size > top) top = size;
        }
      } else {
        analyser.getByteTimeDomainData(bytes);
        for (const value of bytes) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
          const size = Math.abs(centered);
          if (size > top) top = size;
        }
      }
      // a suspended clock hands out zeros: those frames prove nothing about the microphone
      const now = performance.now();
      if (ctx.state !== "running" || document.visibilityState === "hidden" || (lastTick > 0 && now - lastTick > MEASURE_GAP_MS)) broken = true;
      if (ctx.state === "running") {
        measured += 1;
        if (firstTick === 0) firstTick = now;
        if (top > peak) peak = top;
      }
      lastTick = now;
      const level = Math.min(1, Math.sqrt(sum / analyser.fftSize) * 3);
      for (const cb of listeners) cb(level);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  return {
    async start() {
      // getUserMedia exists only in a secure context: https:// or localhost. A phone
      // opening the dev server by LAN IP over plain http has no microphone at all.
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new MicUnavailableError();
      }
      dropped = false;
      opening = true;
      let got: MediaStream;
      try {
        got = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      } finally {
        opening = false;
      }
      if (dropped) {
        // released before the microphone answered: nobody wants this stream — no recorder, no meter
        got.getTracks().forEach((track) => track.stop());
        throw new RecordingDroppedError();
      }
      stream = got;
      try {
        const mimeType = pickMimeType();
        recorder = new MediaRecorder(got, {
          ...(mimeType ? { mimeType } : {}),
          audioBitsPerSecond: 48_000, // best-effort: iOS ignores it (docs/FRONTEND.md)
        });
        chunks.length = 0;
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) chunks.push(event.data);
        };
        recorder.start();
      } catch (cause) {
        // the stream is open and the caller will hear only the error: close it here
        recorder = null;
        teardown();
        throw cause;
      }
      startedAt = Date.now();
      peak = 0;
      measured = 0;
      firstTick = 0;
      lastTick = 0;
      broken = false;
      try {
        meter(got);
      } catch {
        // no level and no peak: the recording itself goes on, and an unmeasured one is never «silent»
        broken = true;
      }
    },

    stop() {
      return new Promise<RecordedAudio>((resolve, reject) => {
        const active = recorder;
        if (!active || active.state === "inactive") {
          // still opening: the stream that comes later is closed on arrival (start() sees `dropped`)
          if (opening) dropped = true;
          teardown();
          reject(new Error("recorder is not running"));
          return;
        }
        const durationMs = Date.now() - startedAt;
        const whole = !broken && measured >= MEASURED_TICKS && lastTick - firstTick >= MEASURE_SPAN * durationMs;
        const heard = whole ? peak : undefined;
        active.onstop = () => {
          const mime = active.mimeType || pickMimeType() || "audio/webm";
          const blob = new Blob(chunks, { type: mime });
          recorder = null;
          teardown();
          resolve({ blob, mime, durationMs, ...(heard === undefined ? {} : { peak: heard }) });
        };
        active.stop();
      });
    },

    cancel() {
      if (opening) dropped = true;
      if (recorder && recorder.state !== "inactive") {
        recorder.onstop = null;
        recorder.stop();
      }
      recorder = null;
      chunks.length = 0;
      teardown();
    },

    onLevel(cb) {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
  };
}
