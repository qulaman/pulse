"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FIELD =
  "min-h-[48px] rounded-[12px] border border-border bg-surface-2 px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);

    const { error: signInError } = await createBrowserSupabase().auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (signInError) {
      setError("Не удалось войти. Проверь почту и пароль");
      setPending(false);
      return;
    }

    // The proxy sends the session to the right screen for the role.
    router.replace("/");
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="flex items-end justify-between">
        <div>
          <PulseMark size="lg" />
          <p className="mt-2 text-[16px] leading-[22px] text-muted">Голосовое управление компанией</p>
        </div>
        <Mascot state={error ? "thinking" : pending ? "listening" : "calm"} size={72} />
      </div>

      <form onSubmit={handleSubmit} className="mt-10 flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium leading-[18px] text-muted">Почта</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className={FIELD}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-[14px] font-medium leading-[18px] text-muted">Пароль</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className={FIELD}
          />
        </label>

        {error ? (
          <p role="alert" className="text-[14px] leading-[18px] text-danger">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="mt-2 min-h-[48px] rounded-[12px] bg-accent px-4 text-[16px] font-semibold text-bg transition-transform duration-[120ms] active:scale-[0.98] disabled:opacity-60"
        >
          {pending ? "Вхожу…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
