"use client";

import { useState, type FormEvent, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Credentials } from "@/components/people/Credentials";
import { LoginCodePanel } from "@/components/people/LoginCodePanel";
import { PasswordField } from "@/components/people/PasswordField";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { visibleEmail } from "@/lib/people/email";
import { generatePassword } from "@/lib/people/password";
import { useChangeLoginEmail, usePersonLogin, useResetPassword, useRevokeSessions, type Person } from "@/lib/people/queries";

import { COMPACT_PASSWORD } from "./PersonEditor";
import { Block } from "./shared";

const FIELD = "field h-10 w-full px-3 text-[14px] leading-5 outline-none";

/**
 * The phone's code panel with its QR in large type (tasks/022 B.2: 280 px) — the person holds a
 * phone up to a monitor, not to another phone. Restyled from outside, the panel is not forked:
 * the QR row turns into a column and the code's QR (`data-testid="qr"`) grows.
 */
const BIG_QR = "[&_div:has(>_svg[data-testid=qr])]:flex-col [&_div:has(>_svg[data-testid=qr])]:items-start [&_svg[data-testid=qr]]:h-[280px] [&_svg[data-testid=qr]]:w-[280px]";

/** The login a new person was created with (B.3): a code to issue at once, or the email and the first password. */
export type Handed = { email: string | null; password: string | null };

function Line({ label, value, tone, action }: { label: string; value: ReactNode; tone?: "warn"; action?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-t border-border/60 px-4 py-2 first:border-t-0">
      <span className="w-32 shrink-0 text-[13px] leading-4 text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5" style={tone ? { color: "var(--warn)" } : undefined}>
        {value}
      </span>
      {action}
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="text-[13px] leading-[18px] text-danger">
      {text}
    </p>
  );
}

/**
 * «Вход» on the person's desk card (D-104, D-135; tasks/022 B.2): the one-time code with a QR
 * in large type, the email the person signs in with and when they last did, a new password,
 * and «Выйти со всех устройств» — a lost phone. The same hooks and words as the phone's
 * `LoginCard`; its sheets are the desk's dialogs here. `manage` — where `canResetLogin` allows;
 * without it only the login just created is handed over (a new director's, as the phone does).
 */
export function LoginBlock({ person, handed, manage }: { person: Person; handed: Handed | null; manage: boolean }) {
  const login = usePersonLogin(person.id, manage);
  const reset = useResetPassword();
  const changeEmail = useChangeLoginEmail();
  const revoke = useRevokeSessions();

  const [dialog, setDialog] = useState<"password" | "email" | "signout" | null>(null);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // the login just created: shown once, «Готово» puts it away
  const [fresh, setFresh] = useState<Handed | null>(handed);
  // a fresh panel after «Готово»: the code exists only on screen
  const [codeKey, setCodeKey] = useState(0);

  const first = person.full_name.split(/\s+/)[0] || person.full_name;
  const shownEmail = visibleEmail(login.data?.email);
  const last = login.data?.last_sign_in_at;
  const close = () => setDialog(null);
  const freshCredentials = fresh?.email && fresh.password ? { email: fresh.email, password: fresh.password } : null;

  const openPassword = () => {
    setPassword(generatePassword());
    setDone(false);
    setError(null);
    setDialog("password");
  };
  const openEmail = () => {
    setEmail(shownEmail ?? "");
    setError(null);
    setDialog("email");
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

  if (!manage && !fresh) return null;

  return (
    <Block title="Вход" testId="desk-login">
      {freshCredentials ? (
        <div className="card flex flex-col gap-3 p-4" data-testid="desk-login-fresh">
          <p className="font-display text-[16px] font-semibold leading-[22px]">{first} — в команде</p>
          <Credentials
            name={person.full_name}
            email={freshCredentials.email}
            password={freshCredentials.password}
            note="Это первый пароль. Свой можно поставить в «Профиле» — старый тогда перестанет работать."
            onDone={() => setFresh(null)}
          />
        </div>
      ) : null}

      {manage || !freshCredentials ? (
        <div className="card flex flex-col gap-3 p-4" data-testid="desk-login-code">
          <p className="font-display text-[15px] font-semibold leading-5">{fresh && !freshCredentials ? `${first} — в команде · код входа` : "Код входа"}</p>
          <div className={BIG_QR}>
            <LoginCodePanel
              key={codeKey}
              person={person}
              // a person just created without an email gets the code at once (the phone's «Добавить»)
              autoIssue={codeKey === 0 && fresh !== null && !freshCredentials}
              onDone={() => {
                setFresh(null);
                setCodeKey((k) => k + 1);
              }}
            />
          </div>
        </div>
      ) : null}

      {manage ? (
        <div className="card overflow-hidden">
          <Line
            label="Почта"
            value={login.isLoading ? "…" : login.isError ? "не прочиталась" : (shownEmail ?? "нет")}
            action={
              login.data ? (
                <Button size="sm" variant="ghost" onClick={openEmail}>
                  {shownEmail ? "Изменить" : "Добавить"}
                </Button>
              ) : null
            }
          />
          <Line
            label="Последний вход"
            value={login.isLoading ? "…" : last ? humanAqtobe(new Date(last)) : login.data ? "ни разу — поможет код входа" : "—"}
            tone={login.data && !last ? "warn" : undefined}
          />
          <Line
            label="Пароль"
            value={login.data && !shownEmail ? "нужна почта" : null}
            action={
              login.data && !shownEmail ? null : (
                <Button size="sm" variant="ghost" onClick={openPassword} data-testid="desk-login-password">
                  Сбросить пароль
                </Button>
              )
            }
          />
          <div className="border-t border-border/60 px-4 py-3">
            <Button
              size="sm"
              variant="danger"
              onClick={() => {
                setError(null);
                setDialog("signout");
              }}
            >
              Выйти со всех устройств
            </Button>
          </div>
        </div>
      ) : null}

      <Dialog open={dialog === "password"} onClose={close} title={done ? "Пароль задан" : `Новый пароль · ${first}`} width="sm">
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
            <p className="text-[13px] leading-[18px] text-muted">Предложил пароль — оставь, крутни ↻ или впиши свой. Старый перестанет работать сразу.</p>
            <div className={COMPACT_PASSWORD}>
              <PasswordField label="Новый пароль" value={password} onChange={setPassword} autoFocus />
            </div>
            <ErrorLine text={error} />
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={close}>
                Отмена
              </Button>
              <Button size="sm" type="submit" loading={reset.isPending} disabled={password.length < 6}>
                Задать пароль
              </Button>
            </div>
          </form>
        )}
      </Dialog>

      <Dialog open={dialog === "email"} onClose={close} title="Почта для входа" width="sm">
        <form onSubmit={submitEmail} className="flex flex-col gap-3">
          <p className="text-[13px] leading-[18px] text-muted">
            {shownEmail
              ? `С этой почтой ${first} входит по паролю. Пароль не меняется.`
              : "Почта нужна только для входа по паролю — например, с компьютера. По коду вход работает и без неё."}
          </p>
          <input
            type="email"
            autoComplete="off"
            autoCapitalize="none"
            aria-label="Почта"
            className={FIELD}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            data-autofocus
          />
          <ErrorLine text={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              Отмена
            </Button>
            <Button size="sm" type="submit" loading={changeEmail.isPending} disabled={!email.includes("@")}>
              Сохранить
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={dialog === "signout"} onClose={() => !revoke.isPending && close()} title={`Выйти со всех устройств · ${first}`} width="sm">
        <div className="flex flex-col gap-3">
          <p className="text-[14px] leading-5 text-muted">
            Вход закроется сразу на всех телефонах и компьютерах, уведомления на них перестанут приходить. Задачи и история останутся.
            Войти снова — по новому коду.
          </p>
          <ErrorLine text={error} />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={close}>
              Отмена
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={revoke.isPending}
              data-testid="revoke-all"
              onClick={() =>
                revoke.mutate(
                  { id: person.id },
                  {
                    onSuccess: ({ sessions }) => {
                      toast(sessions > 0 ? `Вход закрыт на всех устройствах · ${sessions}` : "Открытых входов не было");
                      close();
                    },
                    onError: (e) => setError(e.message),
                  },
                )
              }
            >
              Выйти со всех устройств
            </Button>
          </div>
        </div>
      </Dialog>
    </Block>
  );
}
