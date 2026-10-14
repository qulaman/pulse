"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type FormEvent, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";

import { Arrival, type ArrivalBrand } from "@/components/auth/Arrival";
import { Mascot } from "@/components/brand/Mascot";
import { PulseMark } from "@/components/brand/PulseMark";
import { formatCode, normalizeCode } from "@/lib/login-code/code";
import { deviceId, signInPlace, type SignInPlace } from "@/lib/login-code/device";
import { wipeOffline } from "@/lib/offline/persist";
import { forgetVisit } from "@/lib/pulse/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

const FIELD =
  "min-h-[48px] field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

const noSubscribe = () => () => {};

export type LoginBrand = { name: string; logoUrl: string | null; tagline: string | null; accent?: string };

/**
 * The sign-in screen. The main door is a one-time code from the director or the secretary
 * (D-135): eight digits and the person is in. Email and password stay a quiet link — the
 * director, the secretary and everyone who already has a password (G.21). On a company's own
 * address (`/c/<slug>`, the QR of a code) the screen wears that company's brand.
 */
export function LoginForm({ brand }: { brand: LoginBrand }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"code" | "email">("code");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [arrived, setArrived] = useState<ArrivalBrand | null>(null);

  // what the phone kept for offline was the previous person's (D-127): the sign-in screen —
  // where every sign-out lands — forgets it
  useEffect(() => {
    void wipeOffline();
  }, []);

  // A sign-out is a client-side navigation: nothing of the previous person may survive in this
  // tab — cached lists, the assistant's conversation, the visit stamp. The proxy sends the
  // session to the right screen for the role.
  const enter = () => {
    queryClient.clear();
    void wipeOffline();
    forgetVisit();
    router.replace("/");
    router.refresh();
  };

  const branded = brand.name !== "Pulse" || brand.logoUrl;
  const switchTo = (next: "code" | "email") => {
    setError(null);
    setMode(next);
  };

  return (
    <main
      className="card-in mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-6 py-10"
      style={brand.accent ? ({ "--accent": brand.accent } as CSSProperties) : undefined}
    >
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

      {mode === "code" ? (
        <CodeForm
          pending={pending}
          error={error}
          setPending={setPending}
          setError={setError}
          onSignedIn={(company) => (company ? setArrived(company) : enter())}
        />
      ) : (
        <EmailForm pending={pending} error={error} setPending={setPending} setError={setError} onSignedIn={enter} />
      )}

      <button
        type="button"
        onClick={() => switchTo(mode === "code" ? "email" : "code")}
        className="mx-auto mt-6 min-h-[44px] px-3 text-[14px] leading-[18px] text-muted underline-offset-4 hover:underline"
        data-testid="login-switch"
      >
        {mode === "code" ? "Войти по почте и паролю" : "Войти по коду"}
      </button>

      <p className="mt-4 text-center text-[13px] leading-4 text-muted">
        {mode === "code"
          ? "Код выдают директор или секретарь — в карточке сотрудника"
          : "Доступ выдаёт директор компании. Забыл пароль — попроси его сбросить"}
      </p>

      {arrived ? <Arrival from={brand} to={arrived} onDone={enter} /> : null}
    </main>
  );
}

type FormProps = {
  pending: boolean;
  error: string | null;
  setPending: (pending: boolean) => void;
  setError: (error: string | null) => void;
};

/**
 * Eight digits, grouped «4829 1375» as they are typed; a full code goes by itself — pasted from
 * a message or filled by the keyboard's one-time-code suggestion. On iPhone in a browser tab the
 * field waits behind «сначала на главный экран»: the installed app would not see this sign-in.
 */
function CodeForm({
  pending,
  error,
  setPending,
  setError,
  onSignedIn,
}: FormProps & { onSignedIn: (company: ArrivalBrand | null) => void }) {
  // null while hydrating the server HTML: the platform is known only in the browser
  const place = useSyncExternalStore<SignInPlace | null>(noSubscribe, signInPlace, () => null);
  const [anyway, setAnyway] = useState(false);
  const [value, setValue] = useState("");
  const input = useRef<HTMLInputElement>(null);
  // one request id per code: a retry after a lost answer is the same sign-in (principle 7)
  const request = useRef<{ code: string; id: string } | null>(null);

  const submit = async (raw: string) => {
    const code = normalizeCode(raw);
    if (!code || pending) return;
    if (request.current?.code !== code) request.current = { code, id: globalThis.crypto.randomUUID() };
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/code", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, client_request_id: request.current.id, device: deviceId() }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        brand?: ArrivalBrand;
        error?: { message_ru?: string };
      };
      if (!res.ok || !body.ok) {
        setError(body.error?.message_ru ?? "Не получилось войти — можно ещё раз");
        setPending(false);
        input.current?.select();
        return;
      }
      onSignedIn(body.brand ?? null);
    } catch {
      setError("Нет связи. Когда появится интернет — «Войти» ещё раз");
      setPending(false);
    }
  };

  const onChange = (next: string) => {
    const digits = next.replace(/\D/g, "").slice(0, 8);
    setValue(formatCode(digits));
    if (error) setError(null);
    if (digits.length === 8) void submit(digits);
  };

  if (place === null) return <div className="mt-10 min-h-[188px]" aria-hidden />;

  if ((place === "ios-browser" || place === "in-app") && !anyway) {
    return <InstallFirst place={place} onAnyway={() => setAnyway(true)} />;
  }

  return (
    <form
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        void submit(value);
      }}
      className="mt-10 flex flex-col gap-4"
    >
      <label className="flex flex-col gap-2">
        <span className="text-[14px] font-medium leading-[18px] text-muted">Код входа</span>
        <input
          ref={input}
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          placeholder="0000 0000"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={`${FIELD} nums text-center font-mono text-[28px] font-semibold leading-[36px] tracking-[0.12em] placeholder:text-muted/40`}
          aria-describedby={error ? "code-error" : undefined}
          data-testid="login-code"
          autoFocus
        />
      </label>

      {error ? (
        <p id="code-error" role="alert" className="text-[14px] leading-[18px] text-danger" data-testid="login-code-error">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending || !normalizeCode(value)}
        className="btn-primary mt-2 min-h-[52px] rounded-[12px] px-4 font-display text-[16px] font-semibold text-bg transition-transform duration-[120ms] active:scale-[0.97] disabled:opacity-60"
      >
        {pending ? "Вхожу…" : "Войти"}
      </button>
    </form>
  );
}

/** iPhone in a tab or a messenger's browser: the app goes on the home screen first (D-135 §4). */
function InstallFirst({ place, onAnyway }: { place: "ios-browser" | "in-app"; onAnyway: () => void }) {
  return (
    <section className="mt-10 flex flex-col gap-4" data-testid="login-install-first">
      <h2 className="font-display text-[19px] font-semibold leading-6">
        {place === "in-app" ? "Нужен обычный браузер" : "Сначала — на главный экран"}
      </h2>
      {place === "in-app" ? (
        <p className="text-[16px] leading-[22px] text-muted">
          Отсюда приложение не установить: в меню «⋯» или «Поделиться» — «Открыть в Safari» или «Открыть в Chrome».
        </p>
      ) : (
        <ol className="flex flex-col gap-3 text-[16px] leading-[22px]">
          <Step n={1}>
            Внизу Safari — «Поделиться» <ShareGlyph />
          </Step>
          <Step n={2}>«На экран „Домой“» → «Добавить»</Step>
          <Step n={3}>Открыть приложение с главного экрана и ввести код в нём</Step>
        </ol>
      )}
      <p className="text-[13px] leading-4 text-muted">
        Вход в браузере не перейдёт в приложение на главном экране — код пришлось бы просить заново.
      </p>
      <button
        type="button"
        onClick={onAnyway}
        className="self-start min-h-[44px] text-[14px] leading-[18px] text-muted underline underline-offset-4"
        data-testid="login-anyway"
      >
        Всё равно войти здесь
      </button>
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="flex items-start gap-3">
      <span className="nums mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[13px] font-semibold">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 20 20" width="18" height="18" className="inline-block align-[-3px]" aria-hidden>
      <path d="M10 2.5v10M6.5 6 10 2.5 13.5 6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M6.5 9H5a1 1 0 0 0-1 1v6.5a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V10a1 1 0 0 0-1-1h-1.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

/** Email and password (G.21): the director, the secretary, everyone who already has a password. */
function EmailForm({ pending, error, setPending, setError, onSignedIn }: FormProps & { onSignedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

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
    onSignedIn();
  }

  return (
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
  );
}
