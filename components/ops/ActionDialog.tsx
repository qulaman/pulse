"use client";

import { useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ReasonField, reasonReady } from "@/components/ops/ReasonField";
import { failureText } from "@/components/ops/shell/failure";
import { useHoldOpen } from "@/components/ops/useHoldOpen";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";

/**
 * Every action of the console passes through here (D-157): why it is done, for a dangerous one
 * the company's name typed by hand, and the server's answer in the dialog itself. It closes only
 * after `onSubmit` resolves, and neither Esc nor a click outside takes it away while the action
 * runs; a click outside never does. A disabled button says what it waits for. Plain Enter in the
 * reason sends only what is safe to send: a dangerous action goes by Ctrl+Enter or from the name.
 * The operator cancelling the code (`fresh_required`) is not a failure: the dialog waits with what
 * was typed. Mount it to open it, drop it in `onClose`.
 */
export function ActionDialog({
  title,
  description,
  children,
  confirmLabel,
  danger = false,
  confirmName,
  disabled = false,
  waiting = null,
  initialReason = "",
  width = "md",
  onClose,
  onSubmit,
}: {
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  confirmName?: string;
  disabled?: boolean;
  /** What the action still lacks, in words: it keeps the button closed and is said beside it. */
  waiting?: string | null;
  /** The reason of the step before, in one scenario: it stays in view and can be edited. */
  initialReason?: string;
  width?: "md" | "lg";
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const nameId = useId();
  const form = useRef<HTMLFormElement>(null);
  const [reason, setReason] = useState(initialReason);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName === undefined || typed.trim() === confirmName;
  const lack = waiting ?? (!reasonReady(reason) ? "Осталось написать причину" : !nameMatches ? "Осталось вписать название" : null);
  const ready = lack === null && !disabled;
  useHoldOpen(true);

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (failure) {
      setBusy(false);
      if (failure instanceof OpsError && failure.code === "fresh_required") {
        // the code's dialog hands the focus back to a button that was disabled: it would fall out of this dialog
        requestAnimationFrame(() => form.current?.querySelector("textarea")?.focus());
      } else {
        setError(failureText(failure));
      }
      return;
    }
    onClose();
  };

  const onFormSubmit = (event: FormEvent) => {
    event.preventDefault();
    void submit();
  };
  // the reason takes more than one line, so its Enter is a line: Ctrl+Enter goes from any field
  const onKeyDown = (event: KeyboardEvent<HTMLFormElement>) => {
    if ((event.ctrlKey || event.metaKey) && (event.code === "Enter" || event.code === "NumpadEnter")) {
      event.preventDefault();
      void submit();
    }
  };

  return (
    <Dialog open title={title} width={width} onClose={() => (busy ? undefined : onClose())}>
      <form ref={form} onSubmit={onFormSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-3.5" data-testid="ops-action" data-danger={danger ? "" : undefined}>
        {description ? <div className="text-[13px] leading-[19px] text-[var(--ops-text-2)]">{description}</div> : null}
        {children}
        <ReasonField value={reason} onChange={setReason} disabled={busy} onEnter={danger ? undefined : () => void submit()} />
        {confirmName !== undefined ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-[13px] font-medium leading-5 text-text">
              Впиши название, чтобы подтвердить: <span className="font-semibold text-danger">{confirmName}</span>
            </label>
            <input
              id={nameId}
              value={typed}
              readOnly={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              className="field ops-confirm-name h-9 w-full px-3 text-[14px] leading-5"
              data-testid="ops-confirm-name"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] font-medium leading-5 text-danger" data-testid="ops-action-error">
            {error}
          </p>
        ) : null}
        {/* stays in sight: a long dialog scrolls, its way out does not */}
        <div className="sticky -bottom-5 z-[1] -mx-5 -mb-5 flex items-center justify-end gap-2 border-t border-border bg-surface px-5 py-3">
          {lack ? (
            <span className="mr-auto min-w-0 text-[12px] leading-4 text-muted" data-testid="ops-action-lack">
              {lack}
            </span>
          ) : (
            <span aria-hidden className="mr-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
              {danger ? <Kbd>Ctrl</Kbd> : null}
              <Kbd>Enter</Kbd>
            </span>
          )}
          <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>
            Отмена
          </Button>
          <Button size="sm" type="submit" variant={danger ? "danger" : "primary"} disabled={!ready} loading={busy} data-testid="ops-action-submit">
            {confirmLabel}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
