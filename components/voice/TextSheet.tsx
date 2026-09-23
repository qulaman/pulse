"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { initialsOf } from "@/lib/people/queries";
import { useComposeStore, type ComposePin } from "@/lib/store/compose";
import { useIngestStore } from "@/lib/store/ingest";

/**
 * The typed half of the single input (principle 1): free text goes through the very
 * same parser as speech. Frequent-assignee and deadline preset chips come later.
 */
export function TextSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submitText = useIngestStore((state) => state.submitText);
  const [value, setValue] = useState("");
  // whom it is for, when that was chosen before typing: a chip over the field, an id to the parser (D-84)
  const [pin, setPin] = useState<ComposePin | null>(null);
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  const consumePrefill = useComposeStore((state) => state.consume);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      const request = consumePrefill();
      setPin(request.pin);
      if (request.prefill) setValue(request.prefill);
      fieldRef.current?.focus();
    }, 0);
    return () => clearTimeout(timer);
  }, [open, consumePrefill]);

  const close = () => {
    setValue("");
    setPin(null);
    onClose();
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    const chosen = pin;
    close();
    // the address still goes in front, so the words read as an order to that person
    void submitText(chosen ? `${chosen.address}${text}` : text, chosen ? { id: chosen.id, name: chosen.name } : undefined);
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
      ) : (
        <p className="mb-3 text-[13px] leading-4 text-muted">
          Текст разберу так же, как голос. Чтобы говорить — удерживай кнопку микрофона.
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
      <div className="mt-3">
        <Button block disabled={value.trim().length === 0} onClick={submit}>
          Отправить
        </Button>
      </div>
    </Sheet>
  );
}
