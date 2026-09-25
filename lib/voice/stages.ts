import type { MascotAct, MascotState } from "@/components/brand/Mascot";
import type { IngestErrorCode, IngestStage } from "@/lib/store/ingest";

/**
 * The stages of the voice pipeline the director can see (D-43: the phrase is never
 * silently in flight). One table for both places that show them — the face on the board,
 * which plays the pipeline where the director is looking, and the overlay, which does it
 * on the screens that have no face of their own (D-60, fifth refinement).
 */
export const STAGE_LINE: Partial<Record<IngestStage, string>> = {
  recording: "Слушаю…",
  uploading: "Сохраняю…",
  transcribing: "Распознаю…",
  parsing: "Разбираю…",
  sending: "Отправляю…",
};

/** The pose the assistant holds at each stage — one character doing one job. */
export const STAGE_FACE: Partial<Record<IngestStage, MascotState>> = {
  recording: "listening",
  uploading: "saving",
  transcribing: "transcribing",
  parsing: "parsing",
  sending: "sending",
};

/**
 * What the face plays when the phrase does not make it (tasks/020, phase B): the thirteen codes
 * of docs/AI.md §11, grouped by what the director has to understand. A Record, so a new code
 * without its act does not compile.
 */
export const ERROR_ACT: Record<IngestErrorCode, MascotAct> = {
  // «не расслышал»: a palm to the ear
  stt_failed: "ear",
  empty_transcript: "ear",
  // «не разобрал»: a scratch of the crown
  parse_failed: "scratch",
  parse_refused: "scratch",
  parse_empty: "scratch",
  unknown: "scratch",
  // «слишком коротко»: two fingers a hair apart
  record_too_short: "pinch",
  // the microphone is not there: the ear crossed out
  mic_denied: "nomic",
  mic_unavailable: "nomic",
  // no network, or the audio could not be saved: a phone held up for signal
  network: "signal",
  upload_failed: "signal",
  // «долго думаю», «слишком часто»: a look at the watch
  ai_timeout: "watch",
  rate_limited: "watch",
};

/** mm:ss since the hold started; the caption paints it without re-rendering the board. */
export function elapsedSince(startedAt: number | null): string {
  if (!startedAt) return "0:00";
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
