"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { DeskLight } from "@/components/desk/ui/Light";
import { PulseMark } from "@/components/brand/PulseMark";
import { CodeForm } from "@/components/ops/login/CodeForm";
import { authPost } from "@/components/ops/login/authPost";
import { failureText } from "@/components/ops/shell/failure";
import { copyText } from "@/components/people/copy";
import { QrCode } from "@/components/people/QrCode";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import type { EnrollAnswer, LoginAnswer, LoginBody, VerifyAnswer, VerifyBody } from "@/lib/ops/contract";

const INPUT = "field h-9 w-full px-3 text-[14px] leading-5";
const LABEL = "text-[13px] font-medium leading-5 text-muted";

/** The sign-in's card: the mark over one step at a time; `wide` holds the QR beside its key. */
export function LoginCard({ wide = false, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <div className={`flex w-full flex-col gap-6 ${wide ? "max-w-[560px]" : "max-w-[380px]"}`}>
      <div className="flex items-center gap-3">
        <PulseMark />
        <span className="eyebrow">Консоль</span>
      </div>
      <div className="rounded-[16px] border border-border bg-surface p-5" style={{ boxShadow: "var(--shadow-raised)" }}>
        {children}
      </div>
    </div>
  );
}

/** The console's first screen, a page of its own: nothing of the product's sign-in, nothing of its Supabase client. */
function LoginPage({ wide, children }: { wide?: boolean; children: ReactNode }) {
  return (
    <main id="desk-main" className="relative isolate grid h-dvh place-items-center overflow-y-auto bg-bg p-6">
      <DeskLight tone="accent" />
      <LoginCard wide={wide}>{children}</LoginCard>
    </main>
  );
}

function StepTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-4">
      <h1 className="font-display text-[20px] font-bold leading-[26px] tracking-[-0.02em]">{title}</h1>
      <p className="mt-1 text-[14px] leading-5 text-muted">{hint}</p>
    </div>
  );
}

export function PasswordStep({ onSubmit }: { onSubmit: (email: string, password: string) => Promise<void> }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(email.trim(), password);
    } catch (failure) {
      setError(failureText(failure));
      setPassword("");
    }
    setBusy(false);
  };

  return (
    <>
      <StepTitle title="Вход для разработчиков" hint="Рабочая почта и пароль, потом код из приложения." />
      <form onSubmit={submit} noValidate className="flex flex-col gap-3" data-testid="ops-login-form">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ops-email" className={LABEL}>
            Почта
          </label>
          <input
            id="ops-email"
            type="email"
            required
            autoFocus
            autoComplete="username"
            value={email}
            readOnly={busy}
            onChange={(event) => setEmail(event.target.value)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ops-password" className={LABEL}>
            Пароль
          </label>
          <input
            id="ops-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            readOnly={busy}
            onChange={(event) => setPassword(event.target.value)}
            className={INPUT}
          />
        </div>
        {error ? (
          <p role="alert" className="text-[13px] font-medium leading-5 text-danger" data-testid="ops-login-error">
            {error}
          </p>
        ) : null}
        <Button size="sm" type="submit" block loading={busy} disabled={!email.trim() || !password}>
          Дальше
        </Button>
      </form>
    </>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button size="sm" variant="ghost" className="mr-auto" onClick={onBack}>
      Назад
    </Button>
  );
}

export function EnrollStep({ enroll, onVerify, onBack }: { enroll: EnrollAnswer; onVerify: (code: string) => Promise<void>; onBack: () => void }) {
  return (
    <>
      <StepTitle title="Подключи приложение с кодами" hint="Первый вход: без второго шага консоль не откроется. Подойдёт любое приложение одноразовых кодов." />
      <div className="mb-4 flex items-start gap-4">
        {/* drawn here from the otpauth link: the server's SVG is not poured into the page */}
        <QrCode text={enroll.uri} label="QR для приложения с кодами" size={168} />
        <div className="min-w-0 flex-1">
          <p className={LABEL}>Не сканируется? Впиши ключ руками</p>
          <p className="mt-1.5 break-all font-mono text-[13px] leading-5" data-testid="ops-enroll-secret">
            {enroll.secret}
          </p>
          <Button
            size="sm"
            variant="secondary"
            className="mt-3"
            onClick={() => {
              void copyText(enroll.secret).then((ok) => toast(ok ? "Ключ скопирован" : "Не скопировалось, выдели руками"));
            }}
          >
            Скопировать
          </Button>
        </div>
      </div>
      <CodeForm onVerify={onVerify} label="Код, который показало приложение" submitLabel="Войти" extra={<BackButton onBack={onBack} />} />
    </>
  );
}

export function CodeStep({ onVerify, onBack }: { onVerify: (code: string) => Promise<void>; onBack: () => void }) {
  return (
    <>
      <StepTitle title="Код из приложения" hint="Шесть цифр, они меняются каждые полминуты." />
      <CodeForm onVerify={onVerify} submitLabel="Войти" extra={<BackButton onBack={onBack} />} />
    </>
  );
}

type Step = { kind: "password" } | { kind: "enroll"; enroll: EnrollAnswer } | { kind: "code" };

const CONSOLE_HOME = "/ops";

/** A full load, not a route change: the router may still hold the redirect that brought us here. */
function enterConsole() {
  window.location.replace(CONSOLE_HOME);
}

/**
 * Password → the QR with its key and a code on the first sign-in, a code on every other one
 * (D-157). Sends only to `/api/ops/auth/*`: the session is the console's own cookie.
 */
export function OpsLogin() {
  const [step, setStep] = useState<Step>({ kind: "password" });

  const signIn = async (email: string, password: string) => {
    const answer = await authPost<LoginAnswer>("/api/ops/auth/login", { email, password } satisfies LoginBody);
    if (answer.next === "done") enterConsole();
    else if (answer.next === "verify") setStep({ kind: "code" });
    else setStep({ kind: "enroll", enroll: await authPost<EnrollAnswer>("/api/ops/auth/enroll") });
  };

  const verify = async (body: VerifyBody) => {
    await authPost<VerifyAnswer>("/api/ops/auth/verify", body);
    enterConsole();
  };

  const back = () => setStep({ kind: "password" });

  if (step.kind === "enroll") {
    const { enroll } = step;
    return (
      <LoginPage wide>
        <EnrollStep enroll={enroll} onBack={back} onVerify={(code) => verify({ code, factor_id: enroll.factor_id })} />
      </LoginPage>
    );
  }
  if (step.kind === "code") {
    return (
      <LoginPage>
        <CodeStep onBack={back} onVerify={(code) => verify({ code })} />
      </LoginPage>
    );
  }
  return (
    <LoginPage>
      <PasswordStep onSubmit={signIn} />
    </LoginPage>
  );
}
