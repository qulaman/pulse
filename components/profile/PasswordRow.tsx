"use client";

import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FIELD =
  "min-h-[48px] w-full rounded-[12px] border border-border bg-surface-2 px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

/** Profile row that opens a sheet to set a new password for the signed-in user. */
export function PasswordRow() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setOpen(false);
    setPassword("");
    setRepeat("");
    setError(null);
  };

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 6) return setError("Не короче 6 символов");
    if (password !== repeat) return setError("Пароли не совпадают");
    setPending(true);
    setError(null);
    const { error: updateError } = await createBrowserSupabase().auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      // GoTrue refuses a password equal to the current one
      return setError(
        /different|same/i.test(updateError.message) ? "Это твой нынешний пароль — придумай другой" : "Не получилось сменить пароль. Попробуй ещё раз",
      );
    }
    toast("Пароль обновлён");
    close();
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-[52px] w-full items-center justify-between gap-3 rounded-[16px] border border-border bg-surface px-4 text-left text-[16px] leading-[22px]"
      >
        Пароль
        <span className="text-[13px] leading-4 text-muted">сменить ›</span>
      </button>

      <Sheet open={open} onClose={close} title="Сменить пароль">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Новый пароль"
            aria-label="Новый пароль"
            className={FIELD}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Ещё раз"
            aria-label="Повтор пароля"
            className={FIELD}
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
          />
          {error ? (
            <p role="alert" className="text-[14px] leading-[18px] text-danger">
              {error}
            </p>
          ) : null}
          <Button block type="submit" disabled={pending || !password || !repeat}>
            {pending ? "Сохраняю…" : "Сохранить"}
          </Button>
        </form>
      </Sheet>
    </>
  );
}
