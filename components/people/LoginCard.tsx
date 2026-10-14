"use client";

import { useState, type FormEvent } from "react";

import { Credentials } from "@/components/people/Credentials";
import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { PasswordField } from "@/components/people/PasswordField";
import { ClockIcon, KeyIcon, MailIcon, QrIcon } from "@/components/settings/icons";
import { Button } from "@/components/ui/Button";
import { Row, RowGroup } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { visibleEmail } from "@/lib/people/email";
import { generatePassword } from "@/lib/people/password";
import { useChangeLoginEmail, usePersonLogin, useResetPassword, type Person } from "@/lib/people/queries";

const FIELD =
  "min-h-[52px] w-full field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

/**
 * «Вход» on the person's editor (D-104): «Код входа» first — eight digits and a QR, and the
 * person is in (D-135); then the email they sign in with, when they last did, and «Сбросить
 * пароль» — a ready password in one tap, handed over by copy or share. A person added without
 * an email carries a service address in Auth: it shows as «нет», and a password waits for a
 * real email (lib/people/email.ts). Shown only where `canResetLogin` allows; the routes check
 * the same rule.
 */
export function LoginCard({ person }: { person: Person }) {
  const login = usePersonLogin(person.id, true);
  const reset = useResetPassword();
  const changeEmail = useChangeLoginEmail();

  const [sheet, setSheet] = useState<"code" | "password" | "email" | null>(null);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // a fresh panel per opening; the closing sheet keeps the last one on screen as it slides away
  const [codeKey, setCodeKey] = useState(0);

  const first = person.full_name.split(/\s+/)[0] || person.full_name;
  const shownEmail = visibleEmail(login.data?.email);
  const close = () => setSheet(null);

  const openPassword = () => {
    setPassword(generatePassword());
    setDone(false);
    setError(null);
    setSheet("password");
  };
  const openEmail = () => {
    setEmail(shownEmail ?? "");
    setError(null);
    setSheet("email");
  };

  const submitPassword = (event: FormEvent) => {
    event.preventDefault();
    if (password.length < 6) return setError("Не короче 6 символов");
    setError(null);
    reset.mutate({ id: person.id, password }, { onSuccess: () => setDone(true), onError: (e) => setError(e.message) });
  };
  const submitEmail = (event: FormEvent) => {
    event.preventDefault();
    const next = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(next)) return setError("Похоже, в почте опечатка");
    if (next === shownEmail) return close();
    setError(null);
    changeEmail.mutate(
      { id: person.id, email: next },
      {
        onSuccess: () => {
          toast(`Теперь ${first} может входить и с ${next}`);
          close();
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  const last = login.data?.last_sign_in_at;
  return (
    <section>
      <h2 className="eyebrow px-1">Вход</h2>
      <RowGroup className="mt-2">
        <Row
          icon={<QrIcon />}
          title="Код входа"
          value="выдать"
          onClick={() => {
            setCodeKey((k) => k + 1);
            setSheet("code");
          }}
        />
        <Row
          icon={<MailIcon />}
          title="Почта"
          value={login.isLoading ? "…" : login.isError ? "не прочиталась" : (shownEmail ?? "нет")}
          onClick={login.data ? openEmail : undefined}
        />
        <Row
          icon={<ClockIcon />}
          title="Последний вход"
          tone="muted"
          value={login.isLoading ? "…" : last ? humanAqtobe(new Date(last)) : login.data ? "ни разу" : "—"}
          valueColor={login.data && !last ? "var(--warn)" : undefined}
        />
        {login.data && !shownEmail ? (
          <Row icon={<KeyIcon />} title="Пароль" value="нужна почта" onClick={openEmail} />
        ) : (
          <Row icon={<KeyIcon />} title="Сбросить пароль" value="новый" onClick={openPassword} />
        )}
      </RowGroup>
      {login.data && !last ? (
        <p className="mt-2 px-1 text-[13px] leading-4 text-muted">
          Входа ещё не было — поможет «Код входа»
        </p>
      ) : null}

      <Sheet open={sheet === "code"} onClose={close} title={`Код входа · ${first}`}>
        <LoginCodePanel key={codeKey} person={person} onDone={close} />
      </Sheet>

      <Sheet open={sheet === "password"} onClose={close} title={done ? "Пароль задан" : `Новый пароль · ${first}`}>
        {done ? (
          <Credentials
            name={person.full_name}
            email={shownEmail}
            password={password}
            note="Старый пароль больше не работает. Свой пароль можно поставить в «Профиле»."
            onDone={close}
          />
        ) : (
          <form onSubmit={submitPassword} className="flex flex-col gap-3">
            <p className="text-[14px] leading-[18px] text-muted">Предложил пароль — оставь, крутни ↻ или впиши свой. Старый перестанет работать сразу.</p>
            <PasswordField label="Новый пароль" value={password} onChange={setPassword} />
            {error ? (
              <p role="alert" className="text-[14px] leading-[18px] text-danger">
                {error}
              </p>
            ) : null}
            <Button block type="submit" loading={reset.isPending} disabled={password.length < 6}>
              Задать пароль
            </Button>
          </form>
        )}
      </Sheet>

      <Sheet open={sheet === "email"} onClose={close} title="Почта для входа">
        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          <p className="text-[14px] leading-[18px] text-muted">
            {shownEmail
              ? `С этой почтой ${first} входит по паролю. Пароль не меняется.`
              : "Почта нужна только для входа по паролю — например, с компьютера. По коду вход работает и без неё."}
          </p>
          <input
            type="email"
            inputMode="email"
            autoComplete="off"
            autoCapitalize="none"
            aria-label="Почта"
            className={FIELD}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-autofocus
          />
          {error ? (
            <p role="alert" className="text-[14px] leading-[18px] text-danger">
              {error}
            </p>
          ) : null}
          <Button block type="submit" loading={changeEmail.isPending} disabled={!email.includes("@")}>
            Сохранить
          </Button>
        </form>
      </Sheet>
    </section>
  );
}
