"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { squarePhoto } from "@/lib/people/avatar";
import type { PhotoDraft } from "@/lib/people/card-queries";

import { Face } from "./shared";

/**
 * The card's photo in a form: the square as it will be, «Загрузить» or «Заменить», «Убрать». The
 * picture is squared and shrunk right here, in the browser; it goes anywhere only with the form's
 * «Сохранить», so changing one's mind costs nothing. The key is drawn here too: a retry lands on
 * the same file.
 */
export function PhotoField({
  name,
  current,
  value,
  onChange,
}: {
  name: string;
  /** The photo on the card now. */
  current: string | null;
  value: PhotoDraft;
  onChange: (next: PhotoDraft) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const shown = value.kind === "new" ? value.preview : value.kind === "gone" ? null : current;

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      onChange({ kind: "new", ...(await squarePhoto(file)), key: crypto.randomUUID() });
    } catch {
      toast("Не получилось открыть картинку — нужен JPG, PNG или WebP");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="flex items-center gap-3" data-testid="person-photo">
      <Face person={{ full_name: name, avatar_url: shown }} size={48} initials />
      <input ref={input} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-label="Файл с фото" onChange={(event) => void pick(event.target.files?.[0])} data-testid="person-photo-file" />
      <Button size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()} data-testid="person-photo-pick">
        {shown ? "Заменить" : "Загрузить"}
      </Button>
      {shown ? (
        <Button size="sm" variant="ghost" onClick={() => onChange(current ? { kind: "gone" } : { kind: "same" })} data-testid="person-photo-remove">
          Убрать
        </Button>
      ) : null}
    </div>
  );
}
