import type { MascotState } from "@/components/brand/Mascot";
import type { IngestStage } from "@/lib/store/ingest";

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

/** mm:ss since the hold started; the caption paints it without re-rendering the board. */
export function elapsedSince(startedAt: number | null): string {
  if (!startedAt) return "0:00";
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
