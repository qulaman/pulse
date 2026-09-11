"use client";

import { useRef, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Sheet } from "@/components/ui/Sheet";
import { uploadPhoto } from "@/lib/files/photo";
import { BUTTON, DECLINE_REASONS, TEXT } from "@/lib/tasks/status-text";

const FIELD_CLASS =
  "w-full field px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";

type BaseProps = { open: boolean; onClose: () => void };

/* -------------------------------------------------------------------------- */
/* «Уточнить» — a message with meta.is_question, never a status (D-03)         */
/* -------------------------------------------------------------------------- */

export function AskSheet({ open, onClose, onSubmit }: BaseProps & { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSubmit(value);
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={BUTTON.ask}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        data-autofocus
        placeholder={TEXT.askPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block onClick={submit} disabled={!text.trim()}>
          {BUTTON.send}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Не могу» — chips first: nobody types on a site in the cold                 */
/* -------------------------------------------------------------------------- */

export function DeclineSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (reason: string) => void }) {
  const [chip, setChip] = useState<string | null>(null);
  const [laterDate, setLaterDate] = useState("");
  const [text, setText] = useState("");

  const needsDate = chip === "Буду позже";

  const reset = () => {
    setChip(null);
    setLaterDate("");
    setText("");
  };

  const submit = () => {
    if (!chip) return;
    const head = needsDate && laterDate ? `${chip}: ${laterDate}` : chip;
    const tail = text.trim();
    onSubmit(tail ? `${head}. ${tail}` : head);
    reset();
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.declineTitle}>
      <div className="flex flex-wrap gap-2">
        {DECLINE_REASONS.map((reason) => (
          <Chip
            key={reason}
            tone={chip === reason ? "accent" : "neutral"}
            onClick={() => setChip(reason)}
          >
            {reason}
          </Chip>
        ))}
      </div>

      {needsDate ? (
        <input
          type="date"
          className={`${FIELD_CLASS} mt-3`}
          value={laterDate}
          onChange={(event) => setLaterDate(event.target.value)}
        />
      ) : null}

      <textarea
        className={`${FIELD_CLASS} mt-3`}
        rows={2}
        placeholder={TEXT.declinePlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <div className="mt-3">
        <Button block variant="danger" onClick={submit} disabled={!chip}>
          {BUTTON.cant}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Выполнено» — the report; text is optional in this order, photo/voice next  */
/* -------------------------------------------------------------------------- */

export function ReportSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (text: string, filePath: string | null) => void }) {
  const [text, setText] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const pick = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPhoto(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    setError(null);
  };

  const submit = async () => {
    let filePath: string | null = null;
    if (photo) {
      // the photo lands in Storage first; the status changes only when it is there (принцип 5)
      setUploading(true);
      setError(null);
      try {
        filePath = await uploadPhoto(photo);
      } catch {
        setUploading(false);
        setError(TEXT.photoFailed);
        return;
      }
      setUploading(false);
    }
    onSubmit(text.trim(), filePath);
    setText("");
    pick(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.reportTitle}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        data-autofocus
        placeholder={TEXT.reportPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />

      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={TEXT.photoPick}
        onChange={(event) => pick(event.target.files?.[0] ?? null)}
      />
      {preview ? (
        <div className="relative mt-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL */}
          <img src={preview} alt="" className="card-in max-h-[220px] w-full rounded-[12px] border border-border object-cover" />
          <button
            type="button"
            onClick={() => pick(null)}
            className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-bg/80 text-[16px]"
            aria-label={TEXT.photoRemove}
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-dashed border-border text-[14px] text-muted transition-colors duration-[120ms] active:border-accent"
        >
          <CameraIcon /> {TEXT.photoPick}
        </button>
      )}
      {error ? (
        <p role="alert" className="mt-2 text-[13px] leading-4 text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3">
        <Button block onClick={submit} disabled={uploading}>
          {uploading ? TEXT.photoUploading : BUTTON.complete}
        </Button>
      </div>
    </Sheet>
  );
}

function CameraIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

/* -------------------------------------------------------------------------- */
/* «Доработка» — the director's comment is mandatory                          */
/* -------------------------------------------------------------------------- */

export function ReworkSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (comment: string) => void }) {
  const [text, setText] = useState("");

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSubmit(value);
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.reworkTitle}>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        data-autofocus
        placeholder={TEXT.reworkPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block variant="secondary" onClick={submit} disabled={!text.trim()}>
          {BUTTON.rework}
        </Button>
      </div>
    </Sheet>
  );
}
