"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { MascotScene, type Scene } from "@/components/brand/MascotScene";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { subscribeIngestLevel, useIngestStore, type IngestErrorCode } from "@/lib/store/ingest";
import { STAGE_LINE, elapsedSince } from "@/lib/voice/stages";

/**
 * Visible progress of the pipeline (D-43) and every failure state of docs/AI.md §11.
 * Nothing here blocks the recording itself — it only reports where the phrase is now.
 */

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

const SCENE: Record<string, Scene> = {
  recording: "listening",
  uploading: "saving",
  transcribing: "transcribing",
  parsing: "parsing",
  sending: "sending",
};

export function IngestOverlay({ navigate = true, progress = true }: { navigate?: boolean; /** false on a screen whose own mascot plays the pipeline (the board) */ progress?: boolean } = {}) {
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
  const [level, setLevel] = useState(0);

  // Throttled to ~20 fps: the mascot swells with the voice without re-rendering per frame.
  useEffect(() => {
    if (stage !== "recording") return;
    let last = 0;
    return subscribeIngestLevel((value) => {
      const now = performance.now();
      if (now - last < 50) return;
      last = now;
      setLevel(value);
    });
  }, [stage]);

  useEffect(() => {
    if (stage !== "recording") return;
    const paint = () => {
      if (timerRef.current) timerRef.current.textContent = elapsedSince(recordingStartedAt);
    };
    paint();
    const id = setInterval(paint, 500);
    return () => clearInterval(id);
  }, [stage, recordingStartedAt]);

  // Edge-triggered: one trip to /confirm per parse. A draft the director walked away
  // from stays a draft (DirectorFab shows it) instead of hijacking every navigation.
  const clientRequestId = useIngestStore((state) => state.clientRequestId);
  const navigatedFor = useRef<string | null>(null);
  useEffect(() => {
    if (!navigate || (stage !== "confirm" && stage !== "question")) return;
    const target = stage === "question" ? "/pulse" : "/confirm";
    const key = `${clientRequestId}:${target}`;
    if (navigatedFor.current === key) return;
    navigatedFor.current = key;
    // the board confirms the phrase where it was spoken: nowhere to go, and the trip is
    // marked as made — a draft left on the board must not drag the director to /confirm
    // the moment they open another screen (it waits in the pill instead)
    if (stage === "confirm" && pathname === "/pulse") return;
    // The sandbox renders /confirm in place and must not be sent to the real screen.
    if (pathname !== target) router.push(target);
  }, [navigate, stage, clientRequestId, pathname, router]);

  // Too short to be speech: a toast, not a screen (docs/AI.md §11).
  useEffect(() => {
    if (stage === "error" && error?.code === "record_too_short") {
      toast("Слишком коротко");
      reset();
    }
  }, [stage, error, reset]);

  const showProgress = progress && stage in STAGE_LINE;
  const showError = stage === "error" && error !== null && error.code !== "record_too_short";
  if (!showProgress && !showError) return null;

  return (
    <div
      // while the director holds the face in the middle of the screen, the scene stays above the finger
      className={`fixed inset-0 z-40 flex flex-col items-center px-4 ${stage === "recording" ? "justify-start pt-[10vh]" : "justify-center"}`}
      style={{ background: "var(--overlay)", backdropFilter: "blur(2px)" }}
    >
      {showProgress ? (
        <>
          <MascotScene scene={SCENE[stage] ?? "parsing"} level={level} />
          <p className="mt-5 text-[19px] font-semibold leading-6">
            {STAGE_LINE[stage]}
            {stage === "recording" ? (
              <span ref={timerRef} className="nums ml-2 text-muted">
                0:00
              </span>
            ) : null}
          </p>
        </>
      ) : null}

      {showError && error ? (
        <div
          className="w-full max-w-lg card p-4"
          style={{ boxShadow: "var(--shadow-raised)" }}
        >
          <div className="flex items-start gap-3">
            <Mascot state="thinking" size={40} />
            <p className="text-[16px] leading-[22px]">{error.message ?? ERRORS[error.code].line}</p>
          </div>

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
