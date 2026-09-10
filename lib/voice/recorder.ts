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
};

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

export function createRecorder(): Recorder {
  let stream: MediaStream | null = null;
  let recorder: MediaRecorder | null = null;
  let audioContext: AudioContext | null = null;
  let rafId: number | null = null;
  let startedAt = 0;
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

  /** Loudness for the pulsing ring: RMS of the time-domain buffer, 0..1. */
  function meter(source: MediaStream) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    audioContext = new Ctor();
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(source).connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);

    const tick = () => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (const value of buffer) {
        const centered = (value - 128) / 128;
        sum += centered * centered;
      }
      const level = Math.min(1, Math.sqrt(sum / buffer.length) * 3);
      for (const cb of listeners) cb(level);
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
  }

  return {
    async start() {
      stream = await navigator.mediaDevices.getUserMedia({ audio: AUDIO_CONSTRAINTS });
      const mimeType = pickMimeType();
      recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        audioBitsPerSecond: 48_000, // best-effort: iOS ignores it (docs/FRONTEND.md)
      });
      chunks.length = 0;
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start();
      startedAt = Date.now();
      meter(stream);
    },

    stop() {
      return new Promise<RecordedAudio>((resolve, reject) => {
        const active = recorder;
        if (!active || active.state === "inactive") {
          teardown();
          reject(new Error("recorder is not running"));
          return;
        }
        const durationMs = Date.now() - startedAt;
        active.onstop = () => {
          const mime = active.mimeType || pickMimeType() || "audio/webm";
          const blob = new Blob(chunks, { type: mime });
          recorder = null;
          teardown();
          resolve({ blob, mime, durationMs });
        };
        active.stop();
      });
    },

    cancel() {
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
