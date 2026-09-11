"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FIELD =
  "min-h-[48px] field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

export type LoginBrand = { name: string; logoUrl: string | null; tagline: string | null };

/** The sign-in form; the company's logo and name sit above the product mark (D-44). */
export function LoginForm({ brand }: { brand: LoginBrand }) {
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

  const branded = brand.name !== "Pulse" || brand.logoUrl;

  return (
    <main className="card-in mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10">
      <div className="flex items-end justify-between">
        <div className="min-w-0">
          {branded ? (
            <div className="mb-3 flex items-center gap-3">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
                <img src={brand.logoUrl} alt="" className="h-9 max-w-[140px] object-contain" />
              ) : null}
              <span className="font-display text-[19px] font-bold leading-6 tracking-[-0.02em]">{brand.name}</span>
            </div>
          ) : null}
          <PulseMark size={branded ? "md" : "lg"} />
          <p className="mt-2 text-[16px] leading-[22px] text-muted">{brand.tagline ?? "Голосовое управление компанией"}</p>
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
            placeholder="name@company.kz"
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
            placeholder="••••••••"
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
          className="btn-primary mt-2 min-h-[52px] rounded-[12px] px-4 font-display text-[16px] font-semibold text-bg transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-60"
        >
          {pending ? "Вхожу…" : "Войти"}
        </button>
      </form>

      <p className="mt-8 text-center text-[13px] leading-4 text-muted">
        Доступ выдаёт директор компании. Забыл пароль — попроси его сбросить
      </p>
    </main>
  );
}
