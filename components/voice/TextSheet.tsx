"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";

import { pinOf, useFrequentAssignees } from "@/lib/people/frequent";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { composedText, DUE_PRESETS } from "@/lib/voice/typed";
import { useIngestStore } from "@/lib/store/ingest";
import { initialsOf } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";

/** A chip under the field must not take the focus: the keyboard would fall on an iPhone. */
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * The typed half of the single input (principle 1): free text goes through the very same parser
 * as speech. Over the field — the people this director gives work to most (a tap pins one by id,
 * D-84), under it — deadline words (D-192, И-7): a tap instead of typing a name or a date, never a
 * step of its own.
 */
export function TextSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submitText = useIngestStore((state) => state.submitText);
  const [value, setValue] = useState("");
  // whom it is for, when that was chosen before typing: a chip over the field, an id to the parser (D-84)
  const [pin, setPin] = useState<ComposePin | null>(null);
  const [due, setDue] = useState<string | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const me = useMe().data?.userId;
  const frequent = useFrequentAssignees(me, open);
  // a chip's tap keeps the field focused; if a browser moved the focus anyway, it comes back
  // within the same tap, so an iPhone keeps its keyboard up
  const refocus = () => fieldRef.current?.focus({ preventScroll: true });

  const consumePrefill = useComposeStore((state) => state.consume);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const request = consumePrefill();
      setPin(request.pin);
      if (request.prefill) setValue(request.prefill);
      // focused while the pull is still the gesture — only then does an iPhone raise its keyboard,
      // a focus at the slide's end would cost a tap on the field (принцип 1). No scroll of its
      // own: the sheet stands on the keyboard by itself (Sheet, lib/ui/keyboard.ts)
      fieldRef.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(timer);
  }, [open, consumePrefill]);

  const close = () => {
    setValue("");
    setPin(null);
    setDue(null);
    onClose();
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    const chosen = pin;
    const when = due;
    close();
    // the address still goes in front, so the words read as an order to that person
    void submitText(composedText(text, chosen, when), chosen ? { id: chosen.id, name: chosen.name } : undefined);
  };

  return (
    <Sheet open={open} onClose={close} title={pin ? "Задача" : "Что записать?"}>
      {pin ? (
        <div className="mb-3 flex items-center gap-2" data-testid="text-pin">
          <span className="text-[13px] leading-4 text-muted">Для</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/50 bg-accent/12 py-1 pl-1 pr-1 text-[14px] font-semibold leading-[18px]">
            <span
              aria-hidden
              className="flex h-6 w-6 items-center justify-center rounded-full font-display text-[10px] font-bold text-bg"
              style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
            >
              {initialsOf(pin.name)}
            </span>
            {pin.name}
            <button type="button" aria-label="Убрать исполнителя" onClick={() => setPin(null)} className="ml-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[16px] leading-none text-muted">
              ×
            </button>
          </span>
        </div>
      ) : frequent.length ? (
        <div className="-mx-4 mb-3 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Кому" data-testid="text-people">
          {frequent.map((person) => (
            <Chip
              key={person.id}
              onMouseDown={keepFocus}
              onClick={() => {
                setPin(pinOf(person));
                refocus();
              }}
              className="shrink-0 !pl-1"
            >
              <span
                aria-hidden
                className="flex h-6 w-6 items-center justify-center rounded-full font-display text-[10px] font-bold text-bg"
                style={{ background: "linear-gradient(135deg, var(--accent), var(--accent-2))" }}
              >
                {initialsOf(person.full_name)}
              </span>
              {pinOf(person).name}
            </Chip>
          ))}
        </div>
      ) : (
        <p className="mb-3 text-[13px] leading-4 text-muted">
          Текст разберу так же, как голос. Голосом — потяните маскота на Пульсе вниз.
        </p>
      )}
      <textarea
        ref={fieldRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        rows={3}
        placeholder={pin ? "Подготовить КП для Казхрома до завтра" : "Ерлану подготовить КП для Казхрома до завтра"}
        className="w-full resize-none field px-3 py-3 text-[16px] leading-[22px] outline-none focus:border-accent"
      />
      <div className="-mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]" role="group" aria-label="Срок" data-testid="text-due">
        {DUE_PRESETS.map((preset) => {
          const chosen = due === preset.words;
          return (
            <Chip
              key={preset.words}
              tone={chosen ? "accent" : "neutral"}
              aria-pressed={chosen}
              onMouseDown={keepFocus}
              onClick={() => {
                setDue(chosen ? null : preset.words);
                refocus();
              }}
              className="shrink-0"
            >
              {preset.label}
            </Chip>
          );
        })}
      </div>
      <div className="mt-3">
        <Button block disabled={value.trim().length === 0} onClick={submit}>
          Отправить
        </Button>
      </div>
    </Sheet>
  );
}
