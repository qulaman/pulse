"use client";

import type { GlyphId } from "@/components/brand/mark/glyphs";
import { Button } from "@/components/ui/Button";
import type { IngestErrorCode } from "@/lib/store/ingest";

/**
 * What a failed phrase says, for both places that show it (docs/AI.md §11): the overlay of the screens
 * with no face of their own, and the words over the face on Пульс (2026-11-26).
 */
export type ErrorView = {
  line: string;
  /** Show the raw transcript: the words are not lost even when the parse is. */
  showTranscript?: boolean;
  action?: "retry" | "manual";
};

export const ERROR_VIEW: Record<IngestErrorCode, ErrorView> = {
  record_too_short: { line: "Слишком коротко" },
  mic_silent: { line: "Микрофон молчит — в записи нет звука. Проверьте, включён ли микрофон, и скажите ещё раз" },
  mic_denied: { line: "Не получил доступ к микрофону. Разрешите его в настройках браузера для этого сайта" },
  mic_unavailable: {
    line: "Микрофон здесь недоступен: браузер даёт его только по HTTPS или на localhost. Откройте приложение по HTTPS-адресу",
  },
  empty_transcript: { line: "Не понял, повторить?", action: "retry" },
  stt_failed: { line: "Не расслышал. Аудио сохранил — повторить?", action: "retry" },
  parse_failed: { line: "Распознал текст, но не разобрал", showTranscript: true, action: "retry" },
  parse_refused: { line: "Не берусь разобрать это", showTranscript: true, action: "manual" },
  parse_empty: { line: "Не нашёл здесь ни задач, ни объявлений", showTranscript: true, action: "manual" },
  ai_timeout: { line: "Долго думаю. Повторить?", action: "retry" },
  rate_limited: { line: "Слишком часто. Минуту подожду", action: "retry" },
  upload_failed: { line: "Не смог сохранить аудио — повторить?", action: "retry" },
  network: { line: "Нет связи. Попробую ещё раз", action: "retry" },
  unknown: { line: "Что-то пошло не так — повторить?", action: "retry" },
};

/**
 * What the face's dot is while a failure is up on Пульс — what the failure is about, held in the ring
 * until the words are closed: nothing heard, the microphone, the network, the clock; a phrase not
 * understood is a question. «Слишком коротко» holds nothing: it is a pinch and a word, then rest.
 */
export const ERROR_THING: Record<IngestErrorCode, GlyphId | null> = {
  record_too_short: null,
  empty_transcript: "quiet",
  stt_failed: "quiet",
  mic_silent: "mic-off",
  mic_denied: "mic-off",
  mic_unavailable: "mic-off",
  network: "signal-off",
  upload_failed: "signal-off",
  ai_timeout: "clock",
  rate_limited: "clock",
  parse_failed: "question",
  parse_refused: "question",
  parse_empty: "question",
  unknown: "question",
};

/**
 * The ways out of a failed phrase under the words on Пульс — the overlay's own, nothing fewer: try
 * again (the audio is kept, principle 5) or make the words a task by hand, whichever the failure
 * allows; write it instead, with what was heard already in the input; close.
 */
export function PhraseErrorButtons({
  code,
  onRetry,
  onManual,
  onWrite,
  onClose,
}: {
  code: IngestErrorCode;
  onRetry: () => void;
  onManual: () => void;
  onWrite: () => void;
  onClose: () => void;
}) {
  const action = ERROR_VIEW[code].action;
  return (
    <div className="card-in flex flex-wrap justify-center gap-2 pt-1" data-testid="phrase-error-actions" data-code={code}>
      {action === "retry" ? (
        <Button className="!min-h-[40px] !px-4 !text-[14px]" onClick={onRetry}>
          Повторить
        </Button>
      ) : null}
      {action === "manual" ? (
        <Button className="!min-h-[40px] !px-4 !text-[14px]" onClick={onManual}>
          Сделать задачей
        </Button>
      ) : null}
      <Button variant="secondary" className="!min-h-[40px] !px-4 !text-[14px]" onClick={onWrite}>
        Написать
      </Button>
      <Button variant="ghost" className="!min-h-[40px] !px-3 !text-[14px]" onClick={onClose}>
        Закрыть
      </Button>
    </div>
  );
}
