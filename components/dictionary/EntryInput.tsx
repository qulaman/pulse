"use client";

import { useLayoutEffect, useRef } from "react";

import { Button } from "@/components/ui/Button";

/** Four lines of 22px plus the field's padding and edge: past that the field scrolls. */
const MAX_HEIGHT = 4 * 22 + 22;

/**
 * The field that takes one entry or a whole list (D-111): Enter adds, Shift+Enter breaks
 * the line, a pasted spreadsheet column keeps its line breaks — which is why it is a
 * textarea that grows with the text instead of an input.
 */
export function EntryInput({
  value,
  onChange,
  onSubmit,
  canSubmit,
  placeholder,
  label,
  autoFocus,
  onCancel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  canSubmit: boolean;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  /** Escape, or leaving the field empty. */
  onCancel?: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    // empty: one line, whatever the placeholder — Chrome counts a wrapped placeholder in scrollHeight
    if (!value) {
      node.style.height = "";
      return;
    }
    node.style.height = "auto";
    node.style.height = `${Math.min(node.scrollHeight + 2, MAX_HEIGHT)}px`;
  }, [value]);

  return (
    <div className="flex items-end gap-2">
      <textarea
        ref={ref}
        rows={1}
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoFocus={autoFocus}
        enterKeyHint="done"
        autoCapitalize="sentences"
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape" && onCancel) {
            e.preventDefault();
            onCancel();
          }
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (canSubmit) onSubmit();
          }
        }}
        onBlur={() => {
          if (!value.trim() && onCancel) onCancel();
        }}
        className="no-bar min-h-[44px] w-full flex-1 resize-none field px-3 py-[10px] text-[16px] leading-[22px] text-text outline-none placeholder:text-muted focus:border-accent"
      />
      <Button
        disabled={!canSubmit}
        // the field keeps the keyboard: a tap on the button must not blur it into «cancel»
        onMouseDown={(e) => e.preventDefault()}
        onClick={onSubmit}
      >
        Добавить
      </Button>
    </div>
  );
}
