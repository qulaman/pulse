"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { DateTimeField } from "@/components/ui/datetime/DateTimeField";
import { Sheet } from "@/components/ui/Sheet";
import { uploadPhoto } from "@/lib/files/photo";
import { CANT_REASONS, NOT_MINE, requestButtonLabel, timeChoices } from "@/lib/tasks/lifecycle";
import { BUTTON, TEXT, type TaskStatus } from "@/lib/tasks/status-text";

const FIELD_CLASS =
  "w-full field px-3 py-3 text-[16px] leading-[22px] text-text placeholder:text-muted outline-none focus:border-accent";

type BaseProps = { open: boolean; onClose: () => void };

/* -------------------------------------------------------------------------- */
/* «Уточнить» — a message with meta.is_question, never a status (D-03)         */
/* -------------------------------------------------------------------------- */

/** The questions people actually ask — one tap each, the textarea is for the rest. */
const QUICK_QUESTIONS = ["Когда срок?", "Какой формат?", "Где взять данные?", "Это срочно?"] as const;

export function AskSheet({ open, onClose, onSubmit }: BaseProps & { onSubmit: (text: string) => void }) {
  const [text, setText] = useState("");

  const submit = (value = text) => {
    const clean = value.trim();
    if (!clean) return;
    onSubmit(clean);
    setText("");
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={BUTTON.ask}>
      <div className="mb-3 flex flex-wrap gap-2">
        {QUICK_QUESTIONS.map((question) => (
          <Chip key={question} onClick={() => submit(question)}>
            {question}
          </Chip>
        ))}
      </div>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        data-autofocus
        placeholder={TEXT.askPlaceholder}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-3">
        <Button block onClick={() => submit()} disabled={!text.trim()}>
          {BUTTON.send}
        </Button>
      </div>
    </Sheet>
  );
}

/* -------------------------------------------------------------------------- */
/* «Не могу» — what stands in the way: time, the wrong person, or a real «нет»  */
/* -------------------------------------------------------------------------- */

type CantPick = { kind: "time"; iso: string } | { kind: "decline"; reason: string };

/**
 * One sheet behind «Не могу», on a new task and on work in hand (D-129): the employee says what
 * stands in the way and the director gets a decision to make, not a bare refusal.
 *  - «Нужно больше времени» — a deadline in one chip: the task stays in work (on a new one it
 *    is «возьму, но к …»), the director grants it or keeps the old one;
 *  - «Это не ко мне» — «Подсказать, кому…» opens the people picker, the task returns to the
 *    director with the name; «Не знаю кому» returns it without one;
 *  - «Не смогу сделать» — the refusal, with its reason chip, as before.
 * The words in the field go with whichever path is taken. Two taps from the card, as before.
 */
export function CantSheet({
  open,
  onClose,
  status,
  deadline,
  onTime,
  onDecline,
  onPass,
}: BaseProps & {
  status: TaskStatus;
  deadline: string | null;
  onTime: (iso: string, words: string) => void;
  /** the reason with the employee's words already joined */
  onDecline: (reason: string) => void;
  /** «Подсказать, кому…»: the caller opens the people picker and sends the refusal with the name */
  onPass: (words: string) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title={TEXT.cantTitle}>
      {/* born with every opening: the chips count from the clock and the deadline of this moment */}
      <CantBody status={status} deadline={deadline} onTime={onTime} onDecline={onDecline} onPass={onPass} onClose={onClose} />
    </Sheet>
  );
}

function CantBody({
  status,
  deadline,
  onTime,
  onDecline,
  onPass,
  onClose,
}: {
  status: TaskStatus;
  deadline: string | null;
  onTime: (iso: string, words: string) => void;
  onDecline: (reason: string) => void;
  onPass: (words: string) => void;
  onClose: () => void;
}) {
  const [now] = useState(() => new Date());
  const choices = useMemo(() => timeChoices(now, deadline), [now, deadline]);
  const [pick, setPick] = useState<CantPick | null>(null);
  const [custom, setCustom] = useState(false);
  const [customIso, setCustomIso] = useState<string | null>(null);
  const [words, setWords] = useState("");

  const customAhead = customIso !== null && new Date(customIso).getTime() > now.getTime();
  const isTime = (iso: string) => !custom && pick?.kind === "time" && pick.iso === iso;
  const isReason = (reason: string) => pick?.kind === "decline" && pick.reason === reason;

  const label =
    pick?.kind === "time"
      ? requestButtonLabel(status, pick.iso, now)
      : pick?.kind === "decline"
        ? pick.reason === NOT_MINE
          ? TEXT.cantReturn
          : BUTTON.declineSend
        : TEXT.cantPick;

  const submit = () => {
    if (!pick) return;
    const tail = words.trim();
    if (pick.kind === "time") onTime(pick.iso, tail);
    else onDecline(tail ? `${pick.reason}. ${tail}` : pick.reason);
    onClose();
  };

  return (
    <div data-testid="cant-sheet">
      <GroupLabel>{TEXT.cantTime}</GroupLabel>
      <div className="flex flex-wrap gap-2">
        {choices.map((choice) => (
          <Chip
            key={choice.iso}
            data-testid="cant-time"
            tone={isTime(choice.iso) ? "accent" : "neutral"}
            onClick={() => {
              setCustom(false);
              setPick({ kind: "time", iso: choice.iso });
            }}
          >
            {choice.label}
          </Chip>
        ))}
        <Chip
          tone={custom ? "accent" : "neutral"}
          onClick={() => {
            setCustom(true);
            setPick(customAhead && customIso ? { kind: "time", iso: customIso } : null);
          }}
        >
          {TEXT.cantOtherTime}
        </Chip>
      </div>
      {custom ? (
        <div className="mt-2">
          <DateTimeField
            value={customIso}
            now={now}
            onChange={(iso) => {
              setCustomIso(iso);
              setPick(iso && new Date(iso).getTime() > now.getTime() ? { kind: "time", iso } : null);
            }}
          />
          {customIso && !customAhead ? <p className="mt-1 text-[13px] leading-4 text-danger">{TEXT.cantPast}</p> : null}
        </div>
      ) : null}

      <GroupLabel>{TEXT.cantNotMine}</GroupLabel>
      <div className="flex flex-wrap gap-2">
        <Chip data-testid="cant-pass" onClick={() => onPass(words.trim())}>
          {TEXT.cantSuggest}
        </Chip>
        <Chip tone={isReason(NOT_MINE) ? "accent" : "neutral"} onClick={() => setPick({ kind: "decline", reason: NOT_MINE })}>
          {TEXT.cantNobody}
        </Chip>
      </div>

      <GroupLabel>{TEXT.cantRefuse}</GroupLabel>
      <div className="flex flex-wrap gap-2">
        {CANT_REASONS.map((reason) => (
          <Chip key={reason} data-testid="cant-reason" tone={isReason(reason) ? "accent" : "neutral"} onClick={() => setPick({ kind: "decline", reason })}>
            {reason}
          </Chip>
        ))}
      </div>

      <textarea
        className={`${FIELD_CLASS} mt-4`}
        rows={2}
        placeholder={TEXT.cantWords}
        value={words}
        onChange={(event) => setWords(event.target.value)}
      />

      <div className="mt-3">
        {/* the card button chose; this one sends — the same word on both read as a stuck tap */}
        <Button
          block
          data-testid="cant-send"
          variant={pick?.kind === "decline" && pick.reason !== NOT_MINE ? "danger" : "primary"}
          onClick={submit}
          disabled={!pick}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

function GroupLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-2 mt-4 font-display text-[12px] font-semibold uppercase leading-4 tracking-[0.09em] text-muted first:mt-0">{children}</p>
  );
}

/* -------------------------------------------------------------------------- */
/* «Выполнено» — the report; text is optional in this order, photo/voice next  */
/* -------------------------------------------------------------------------- */

/**
 * The handover: words, a photo and — when the work is not all done — «Сделано не всё» (D-129):
 * the director sees «сдано частично» and decides with the usual buttons.
 */
export function ReportSheet({
  open,
  onClose,
  onSubmit,
}: BaseProps & { onSubmit: (text: string, filePath: string | null, partial: boolean) => void }) {
  const [text, setText] = useState("");
  const [partial, setPartial] = useState(false);
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
    onSubmit(text.trim(), filePath, partial);
    setText("");
    setPartial(false);
    pick(null);
    onClose();
  };

  return (
    <Sheet open={open} onClose={onClose} title={TEXT.reportTitle}>
      <div className="mb-3 flex flex-wrap gap-2">
        <Chip data-testid="report-partial" tone={partial ? "accent" : "neutral"} aria-pressed={partial} onClick={() => setPartial((was) => !was)}>
          {TEXT.reportPartial}
        </Chip>
      </div>
      <textarea
        className={FIELD_CLASS}
        rows={3}
        data-autofocus
        placeholder={partial ? TEXT.reportPartialPlaceholder : TEXT.reportPlaceholder}
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
          {uploading ? TEXT.photoUploading : partial ? TEXT.reportPartialSend : BUTTON.complete}
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
