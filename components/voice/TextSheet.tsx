"use client";

import { useEffect, useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { useIngestStore } from "@/lib/store/ingest";

/**
 * The typed half of the single input (principle 1): free text goes through the very
 * same parser as speech. Frequent-assignee and deadline preset chips come later.
 */
export function TextSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const submitText = useIngestStore((state) => state.submitText);
  const [value, setValue] = useState("");
  const fieldRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) fieldRef.current?.focus();
  }, [open]);

  const close = () => {
    setValue("");
    onClose();
  };

  const submit = () => {
    const text = value.trim();
    if (!text) return;
    close();
    void submitText(text);
  };

  return (
    <Sheet open={open} onClose={close} title="Что записать?">
      <p className="mb-3 text-[13px] leading-4 text-muted">
        Текст разберу так же, как голос. Чтобы говорить — удерживай кнопку микрофона.
      </p>
      <textarea
        ref={fieldRef}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) submit();
        }}
        rows={3}
        placeholder="Ерлану подготовить КП для Казхрома до завтра"
        className="w-full resize-none rounded-[12px] border border-border bg-surface-2 px-3 py-3 text-[16px] leading-[22px] outline-none focus:border-accent"
      />
      <div className="mt-3">
        <Button block disabled={value.trim().length === 0} onClick={submit}>
          Отправить
        </Button>
      </div>
    </Sheet>
  );
}
