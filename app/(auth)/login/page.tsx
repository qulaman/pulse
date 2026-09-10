"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { createBrowserSupabase } from "@/lib/supabase/client";

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
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <h1 className="text-[24px] font-bold leading-[30px]">Pulse</h1>
      <p className="mt-2 text-[16px] leading-[22px] text-muted">
        Голосовое управление компанией
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
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
            className="min-h-[44px] rounded-xl border border-border bg-surface-2 px-3 text-[16px] leading-[22px] outline-none focus:border-accent"
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
            className="min-h-[44px] rounded-xl border border-border bg-surface-2 px-3 text-[16px] leading-[22px] outline-none focus:border-accent"
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
          className="min-h-[44px] rounded-xl bg-accent px-4 text-[16px] font-semibold text-bg disabled:opacity-60"
        >
          {pending ? "Вхожу…" : "Войти"}
        </button>
      </form>
    </main>
  );
}
