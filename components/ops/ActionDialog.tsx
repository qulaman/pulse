"use client";

import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { ReasonField, reasonReady } from "@/components/ops/ReasonField";
import { failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";
import { OpsError } from "@/lib/ops/client";

/**
 * Every action of the console passes through here (D-157): why it is done, for a dangerous one
 * the company's name typed by hand, and the server's answer in the dialog itself. It closes only
 * after `onSubmit` resolves, and neither Esc nor a click outside takes it away while the action
 * runs. The operator cancelling the code (`fresh_required`) is not a failure: the dialog waits
 * with what was typed. Mount it to open it, drop it in `onClose`.
 */
export function ActionDialog({
  title,
  description,
  children,
  confirmLabel,
  danger = false,
  confirmName,
  disabled = false,
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
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const nameId = useId();
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nameMatches = confirmName === undefined || typed.trim() === confirmName;
  const ready = reasonReady(reason) && nameMatches && !disabled;

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (failure) {
      setBusy(false);
      if (!(failure instanceof OpsError && failure.code === "fresh_required")) setError(failureText(failure));
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
    <Dialog open title={title} onClose={() => (busy ? undefined : onClose())}>
      <form onSubmit={onFormSubmit} onKeyDown={onKeyDown} className="flex flex-col gap-4" data-testid="ops-action">
        {description ? <div className="text-[14px] leading-5 text-muted">{description}</div> : null}
        {children}
        <ReasonField value={reason} onChange={setReason} disabled={busy} />
        {confirmName !== undefined ? (
          <div className="flex flex-col gap-1.5">
            <label htmlFor={nameId} className="text-[13px] font-medium leading-5 text-muted">
              Впиши название, чтобы подтвердить: <span className="font-semibold text-text">{confirmName}</span>
            </label>
            <input
              id={nameId}
              value={typed}
              readOnly={busy}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setTyped(event.target.value)}
              className="field h-9 w-full px-3 text-[14px] leading-5"
              data-testid="ops-confirm-name"
            />
          </div>
        ) : null}
        {error ? (
          <p role="alert" className="text-[13px] font-medium leading-5 text-danger" data-testid="ops-action-error">
            {error}
          </p>
        ) : null}
        <div className="flex items-center justify-end gap-2">
          <span aria-hidden className="mr-auto flex items-center gap-1.5 text-[12px] leading-4 text-muted">
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </span>
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
