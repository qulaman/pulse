"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";

import { failureText } from "@/components/ops/shell/failure";
import { Button } from "@/components/ui/Button";

const CODE_LENGTH = 6;

/**
 * Six digits from the authenticator: the sign-in's and the fresh prompt's one form. The sixth
 * digit sends it by itself; a pasted «123 456» is taken as well. A wrong code is said and the
 * field is empty for the next one, which keeps the caret: `readOnly` while it runs, not `disabled`.
 * `onVerify` that resolves leaves the form busy: whoever called it is leaving the screen.
 */
export function CodeForm({
  onVerify,
  label = "Код из приложения",
  submitLabel = "Подтвердить",
  extra,
}: {
  onVerify: (code: string) => Promise<void>;
  label?: string;
  submitLabel?: string;
  /** Beside the main button: «Отмена», «Назад». */
  extra?: ReactNode;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const verify = async (value: string) => {
    if (busy || value.length !== CODE_LENGTH) return;
    setBusy(true);
    setError(null);
    try {
      await onVerify(value);
    } catch (failure) {
      setBusy(false);
      setCode("");
      setError(failureText(failure));
    }
  };

  const onChange = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) void verify(digits);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    void verify(code);
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3" data-testid="ops-code-form">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="text-[13px] font-medium leading-5 text-muted">
          {label}
        </label>
        <input
          id={id}
          data-autofocus
          autoFocus
          value={code}
          readOnly={busy}
          inputMode="numeric"
          autoComplete="one-time-code"
          placeholder="000000"
          onChange={(event) => onChange(event.target.value)}
          className="field nums h-12 w-full px-3 text-center font-display text-[24px] font-semibold leading-7 tracking-[0.32em] placeholder:text-muted/40"
          data-testid="ops-code"
        />
      </div>
      {error ? (
        <p role="alert" className="text-[13px] font-medium leading-5 text-danger" data-testid="ops-code-error">
          {error}
        </p>
      ) : null}
      <div className="flex items-center justify-end gap-2">
        {extra}
        <Button size="sm" type="submit" disabled={code.length !== CODE_LENGTH} loading={busy} data-testid="ops-code-submit">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
