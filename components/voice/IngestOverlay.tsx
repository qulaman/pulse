"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { useIngestStore, type IngestErrorCode } from "@/lib/store/ingest";

/**
 * Visible progress of the pipeline (D-43) and every failure state of docs/AI.md §11.
 * Nothing here blocks the recording itself — it only reports where the phrase is now.
 */

const STAGE_LINE: Record<string, string> = {
  recording: "Слушаю…",
  uploading: "Сохраняю…",
  transcribing: "Распознаю…",
  parsing: "Разбираю…",
  sending: "Отправляю…",
};

type ErrorView = {
  line: string;
  /** Show the raw transcript: the words are not lost even when the parse is. */
  showTranscript?: boolean;
  action?: "retry" | "manual";
};

const ERRORS: Record<IngestErrorCode, ErrorView> = {
  record_too_short: { line: "Слишком коротко" },
  mic_denied: { line: "Не получил доступ к микрофону. Разреши его в настройках браузера для этого сайта" },
  mic_unavailable: {
    line: "Микрофон здесь недоступен: браузер даёт его только по HTTPS или на localhost. Открой приложение по HTTPS-адресу",
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

function elapsed(startedAt: number | null): string {
  if (!startedAt) return "0:00";
  const total = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

function Skeleton() {
  return (
    <div className="mt-6 w-full max-w-lg space-y-3 px-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-[72px] rounded-[16px] border border-border bg-surface"
          style={{ opacity: 1 - i * 0.25 }}
        />
      ))}
    </div>
  );
}

export function IngestOverlay({ navigate = true }: { navigate?: boolean } = {}) {
  const stage = useIngestStore((state) => state.stage);
  const error = useIngestStore((state) => state.error);
  const transcript = useIngestStore((state) => state.transcript);
  const recordingStartedAt = useIngestStore((state) => state.recordingStartedAt);
  const retry = useIngestStore((state) => state.retry);
  const reset = useIngestStore((state) => state.reset);
  const startManual = useIngestStore((state) => state.startManual);

  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (stage !== "recording") return;
    const paint = () => {
      if (timerRef.current) timerRef.current.textContent = elapsed(recordingStartedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [stage, recordingStartedAt]);

  useEffect(() => {
    // The sandbox renders /confirm in place and must not be sent to the real screen.
    if (navigate && stage === "confirm" && pathname !== "/confirm") router.push("/confirm");
  }, [navigate, stage, pathname, router]);

  // Too short to be speech: a toast, not a screen (docs/AI.md §11).
  useEffect(() => {
    if (stage === "error" && error?.code === "record_too_short") {
      toast("Слишком коротко");
      reset();
    }
  }, [stage, error, reset]);

  const showProgress = stage in STAGE_LINE;
  const showError = stage === "error" && error !== null && error.code !== "record_too_short";
  if (!showProgress && !showError) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col items-center justify-center px-4"
      style={{ background: "var(--overlay)", backdropFilter: "blur(2px)" }}
    >
      {showProgress ? (
        <>
          <p className="text-[19px] font-semibold leading-6">
            {STAGE_LINE[stage]}
            {stage === "recording" ? (
              <span ref={timerRef} className="nums ml-2 text-muted">
                0:00
              </span>
            ) : null}
          </p>
          {stage !== "recording" ? <Skeleton /> : null}
        </>
      ) : null}

      {showError && error ? (
        <div
          className="w-full max-w-lg rounded-[16px] border border-border bg-surface p-4"
          style={{ boxShadow: "var(--shadow-raised)" }}
        >
          <p className="text-[16px] leading-[22px]">{error.message ?? ERRORS[error.code].line}</p>

          {ERRORS[error.code].showTranscript && transcript ? (
            <p className="mt-3 rounded-[12px] bg-surface-2 px-3 py-2 text-[14px] leading-[18px] text-muted">
              {transcript}
            </p>
          ) : null}

          <div className="mt-4 flex gap-2">
            {ERRORS[error.code].action === "manual" ? (
              <Button block onClick={startManual}>
                Создать задачу вручную
              </Button>
            ) : null}
            {ERRORS[error.code].action === "retry" ? (
              <Button block onClick={() => void retry()}>
                Повторить
              </Button>
            ) : null}
            <Button variant="ghost" onClick={reset}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
