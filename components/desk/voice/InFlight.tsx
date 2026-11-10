"use client";

import { PanelHeader } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { cancelDeskVoice, finishDeskVoice } from "@/components/desk/voice/control";
import { Elapsed, LevelBars } from "@/components/desk/voice/MicButton";
import { Button } from "@/components/ui/Button";
import { flightSteps } from "@/lib/desk/voice";
import { useIngestStore } from "@/lib/store/ingest";
import { STAGE_LINE } from "@/lib/voice/stages";

/**
 * The phrase on its way, in the panel where its result will stand (D-164): the panel opens the
 * moment Enter is pressed or the microphone is clicked — «Слушаю…» with the voice and the time,
 * then «Сохраняю…», «Распознаю…» with the words once heard, «Разбираю…» — and the parsed order
 * replaces this view in the same place. Never a phrase that seems to have vanished (D-43).
 * Closed while it travels, the panel comes back by itself with the result.
 */
export function InFlight() {
  const stage = useIngestStore((state) => state.stage);
  const source = useIngestStore((state) => state.source);
  const transcript = useIngestStore((state) => state.transcript);
  const pinned = useIngestStore((state) => state.pinned);
  const recording = stage === "recording";
  const spoken = source === "voice";
  // the words glued in front of a pinned person's phrase are the address, not what was said
  const address = useIngestStore((state) => state.address);
  const words = address && transcript.startsWith(address) ? transcript.slice(address.length) : transcript;

  return (
    <section className="flex flex-col gap-4" data-testid="desk-ingest-flight" data-stage={stage}>
      <PanelHeader>
        <h2 className="desk-task-title flex items-baseline gap-2.5 text-[21px] leading-[26px]" aria-live="polite">
          {STAGE_LINE[stage] ?? "Разбираю…"}
          {recording ? <Elapsed className="font-mono text-[15px] font-medium leading-5 text-muted" /> : null}
        </h2>
        {pinned ? (
          <p className="mt-1 text-[14px] leading-5 text-muted">
            Кому: <span className="font-medium text-text">{pinned.name}</span>
          </p>
        ) : null}
      </PanelHeader>

      {recording ? (
        <>
          <div className="flex items-center gap-3 text-accent">
            <span aria-hidden className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full bg-current motion-reduce:animate-none" />
            <LevelBars height={36} bar={5} gap={4} />
            <span className="text-[14px] leading-5 text-muted">{pinned ? "Скажите, что сделать и к какому сроку" : "Скажите, кому, что и к какому сроку"}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => void finishDeskVoice()} data-testid="voice-finish">
              Готово
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void cancelDeskVoice()} data-testid="voice-cancel">
              Отмена
            </Button>
            <span className="ml-auto flex items-center gap-1 text-[12px] leading-4 text-muted">
              <Kbd>Enter</Kbd> готово · <Kbd>Esc</Kbd> отмена
            </span>
          </div>
          <p className="text-[12px] leading-4 text-muted">Запись сохраню до разбора — даже если связь пропадёт.</p>
        </>
      ) : (
        <>
          {words.trim() ? (
            <p className="-ml-3 border-l-2 border-accent pl-2.5 text-[15px] leading-[22px]" data-testid="desk-ingest-words">
              «{words.trim()}»
            </p>
          ) : (
            <p className="text-[14px] leading-5 text-muted">Слова появятся здесь.</p>
          )}
          <span aria-hidden className="relative block h-[2px] overflow-hidden bg-border">
            <span className="desk-progress block h-full w-1/3 bg-accent" />
          </span>
        </>
      )}

      {spoken ? (
        <ol className="flex flex-col gap-1.5" data-testid="desk-ingest-steps">
          {flightSteps(stage).map((step) => (
            <li key={step.key} data-state={step.state} className={`flex items-center gap-2 text-[13px] leading-5 ${step.state === "next" ? "text-muted/60" : step.state === "now" ? "font-medium text-text" : "text-muted"}`}>
              <span aria-hidden className="flex w-4 justify-center">
                {step.state === "done" ? <span style={{ color: "var(--ok)" }}>✓</span> : step.state === "now" ? <span className="h-1.5 w-1.5 rounded-full bg-accent" /> : <span className="h-1 w-1 rounded-full bg-current" />}
              </span>
              {step.label}
            </li>
          ))}
        </ol>
      ) : null}

      {!recording ? <p className="text-[12px] leading-4 text-muted">Панель можно закрыть — разбор откроется здесь сам.</p> : null}
    </section>
  );
}
