"use client";

import { useEffect, useRef, useState } from "react";

import { DeskConfirm } from "@/components/desk/DeskConfirm";
import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Kbd } from "@/components/desk/ui/Kbd";
import { COMMAND_FIELD_ID } from "@/lib/desk/keys";
import { initialsOf } from "@/lib/people/queries";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { useIngestStore, type IngestStage } from "@/lib/store/ingest";
import { STAGE_LINE } from "@/lib/voice/stages";

/** Stages the line shows as a thin bar under itself; the phrase is never silently in flight (D-43). */
const WORKING: ReadonlySet<IngestStage> = new Set(["uploading", "transcribing", "parsing", "sending"]);
/** Stages that have something to show in the panel: the cards, the question, the failure. */
const IN_PANEL: ReadonlySet<IngestStage> = new Set(["confirm", "sending", "question", "error"]);

/**
 * The director's order line over the whole desk (D-153 §5): free text goes through the very same
 * parser as speech (principle 1; the errand matcher of D-79 §9 is inside `submitText`), the stage
 * shows under the line, the parsed cards come up in the right-hand panel. «Дать задачу» from a
 * person's card puts the name in front, pinned by id (D-84). No microphone here (В-11 г).
 */
export function CommandLine() {
  const submitText = useIngestStore((state) => state.submitText);
  const stage = useIngestStore((state) => state.stage);
  const reset = useIngestStore((state) => state.reset);
  const [value, setValue] = useState("");
  const [pin, setPin] = useState<ComposePin | null>(null);
  const field = useRef<HTMLInputElement>(null);

  // «Дать задачу» on a person's card: one-shot, consumed here (the phone's sheet does the same)
  useEffect(
    () =>
      useComposeStore.subscribe((state, previous) => {
        if (state.requestId === previous.requestId) return;
        const request = useComposeStore.getState().consume();
        setPin(request.pin);
        if (request.prefill) setValue(request.prefill);
        field.current?.focus();
      }),
    [],
  );

  const working = WORKING.has(stage);
  const submit = () => {
    const text = value.trim();
    if (!text || working) return;
    const chosen = pin;
    setValue("");
    setPin(null);
    // the address still goes in front, so the words read as an order to that person
    void submitText(chosen ? `${chosen.address}${text}` : text, chosen ? { id: chosen.id, name: chosen.name } : undefined);
  };

  return (
    <div className="relative min-w-0 flex-1">
      <div className="field flex h-10 items-center gap-2 pl-3 pr-2">
        {pin ? (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-accent/50 bg-accent/12 py-0.5 pl-0.5 pr-1 text-[13px] font-semibold leading-[18px]" data-testid="command-pin">
            <span
              aria-hidden
              className="flex h-5 w-5 items-center justify-center rounded-full font-display text-[9px] font-bold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            >
              {initialsOf(pin.name)}
            </span>
            {pin.name}
            <button type="button" aria-label="Убрать исполнителя" onClick={() => setPin(null)} className="flex h-5 w-5 items-center justify-center rounded-full text-[14px] leading-none text-muted hover:text-text">
              ×
            </button>
          </span>
        ) : null}
        <input
          ref={field}
          id={COMMAND_FIELD_ID}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            } else if (event.key === "Backspace" && !value && pin) {
              setPin(null);
            }
          }}
          placeholder={pin ? "Что сделать и к какому сроку — Enter" : "Кому и что сделать, срок… — Enter"}
          aria-label="Поручение"
          autoComplete="off"
          spellCheck={false}
          data-testid="command-line"
          className="min-w-0 flex-1 bg-transparent text-[14px] leading-5 outline-none placeholder:text-muted"
          style={{ caretColor: "var(--accent)" }}
        />
        {working ? (
          <span className="shrink-0 text-[12px] font-medium leading-4 text-accent" data-testid="command-stage">
            {STAGE_LINE[stage]}
          </span>
        ) : (
          <span className="hidden shrink-0 items-center gap-1 lg:flex" aria-hidden>
            <Kbd>Ctrl</Kbd>
            <Kbd>K</Kbd>
          </span>
        )}
      </div>
      {working ? (
        <span aria-hidden className="absolute inset-x-3 -bottom-[3px] h-[2px] overflow-hidden rounded-full bg-accent/15">
          <span className="desk-progress block h-full w-1/3 rounded-full bg-accent" />
        </span>
      ) : null}
      {IN_PANEL.has(stage) ? (
        <InPanel panelKey="ingest" onClose={reset}>
          <DeskConfirm />
        </InPanel>
      ) : null}
    </div>
  );
}
