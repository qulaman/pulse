"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";

const FIELD =
  "min-h-[48px] w-full field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

/** Edit page, «Вход» block: the director hands out a fresh password in person. */
export function ResetPasswordCard({ personId }: { personId: string }) {
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    const res = await fetch(`/api/people/${personId}/password`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);
    if (!res.ok) {
      const message = await res
        .json()
        .then((j: { error?: { message?: string } }) => j.error?.message)
        .catch(() => undefined);
      setError(message ?? "Не получилось сменить пароль");
      return;
    }
    toast("Пароль обновлён. Скажи его сотруднику лично");
    setPassword("");
  }

  return (
    <section className="card p-4">
      <h2 className="text-[19px] font-semibold leading-6">Вход</h2>
      <p className="mt-1 text-[13px] leading-4 text-muted">
        Забыл пароль — задай новый и скажи лично. В приложении он сменит его на свой
      </p>
      <div className="mt-3 flex gap-2">
        <input
          type="text"
          autoComplete="off"
          placeholder="Новый пароль, от 6 символов"
          aria-label="Новый пароль сотрудника"
          className={FIELD}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <Button variant="secondary" disabled={pending || password.length < 6} onClick={submit}>
          {pending ? "…" : "Задать"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[14px] leading-[18px] text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
