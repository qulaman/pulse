"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { copyText } from "@/components/people/copy";
import { QrCode } from "@/components/people/QrCode";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { CODE_TTL_SECONDS, codeMessage, formatCode } from "@/lib/login-code/code";
import { visibleEmail } from "@/lib/people/email";
import { generatePassword, loginMessage } from "@/lib/people/password";
import {
  useChangeLoginEmail,
  useIssueLoginCode,
  useLoginCodeStatus,
  usePersonLogin,
  useResetPassword,
  useRevokeSessions,
  type IssuedCode,
  type Person,
} from "@/lib/people/queries";

import { CopyButton, INPUT, PasswordInput } from "./fields";
import { Block } from "./shared";

/** The login a new person was created with (B.3): a code to issue at once, or the email and the first password. */
export type Handed = { email: string | null; password: string | null };

/** «14:35» on the clock of Aqtobe. */
function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}

/** «12:41» left on a code. */
function left(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function Line({ label, value, tone, action }: { label: string; value: ReactNode; tone?: "warn"; action?: ReactNode }) {
  return (
    <div className="flex min-h-10 items-center gap-3 border-t border-border/60 px-4 py-1.5 first:border-t-0">
      <span className="w-[116px] shrink-0 text-[13px] leading-5 text-muted">{label}</span>
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

const CHECK = (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The one-time sign-in code on the desk (D-135, wave 3): the phone's `LoginCodePanel` in a
 * monitor's terms — the QR large (the person holds a phone up to the screen), the eight digits in
 * monospace with a copy button, the minutes left, «Ждёт входа…» turning into «Вход выполнен ·
 * iPhone» while the person is still at the desk; the ready message to copy for a messenger. The
 * code lives on this screen only; a new one cancels the last. Issued only by a press here
 * (or at once for a person just created) — never by a menu or a key.
 */
function CodePanel({ person, autoIssue, onDone, focus }: { person: Person; autoIssue: boolean; onDone: () => void; focus: boolean }) {
  const issue = useIssueLoginCode();
  const { mutate } = issue;
  const [issued, setIssued] = useState<{ code: IssuedCode; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const issueBox = useRef<HTMLSpanElement>(null);
  const tv = person.role === "tv";
  const first = person.full_name.trim().split(/\s+/)[0] || person.full_name;

  // counted from the moment the answer came, not from the server's clock read by this one
  const leftMs = issued ? CODE_TTL_SECONDS * 1000 - (now - issued.at) : 0;
  const status = useLoginCodeStatus(person.id, true, issued !== null && leftMs > 0);
  const landed = issued !== null && status.data?.state === "used" && Date.parse(status.data.expires_at ?? "") === Date.parse(issued.code.expires_at);
  const expired = issued !== null && !landed && leftMs <= 0;

  const doIssue = useRef((id: string) => {
    setError(null);
    mutate(
      { id, requestId: globalThis.crypto.randomUUID() },
      {
        onSuccess: (code) => {
          setIssued({ code, at: Date.now() });
          setNow(Date.now());
        },
        onError: (e) => setError(e.message),
      },
    );
  });
  const started = useRef(false);
  useEffect(() => {
    if (!autoIssue || started.current) return;
    started.current = true;
    doIssue.current(person.id);
  }, [autoIssue, person.id]);
  useEffect(() => {
    if (!issued || landed || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [issued, landed, expired]);
  // «Выдать код входа…» from the team's menu: the button in sight and under the caret, not pressed
  useEffect(() => {
    if (focus) issueBox.current?.querySelector("button")?.focus({ preventScroll: true });
  }, [focus]);

  if (!issued) {
    const last = status.data;
    const lastLine =
      last && last.state !== "none"
        ? last.state === "used" && last.used_at
          ? `Последний вход по коду — ${last.device ?? "устройство"}, ${humanAqtobe(new Date(last.used_at))}`
          : last.state === "open" && last.issued_at && last.expires_at
            ? `Код выдан в ${hm(last.issued_at)}${last.issued_by ? ` (${last.issued_by})` : ""} и ждёт входа до ${hm(last.expires_at)} — новый отменит его`
            : "Последний код так и не ввели"
        : null;
    return (
      <div className="flex items-start gap-4 px-4 py-3" data-testid="desk-code-idle">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-5">Код входа</p>
          <p className="mt-0.5 text-[13px] leading-[18px] text-muted">
            {autoIssue && !error
              ? "Выдаю код…"
              : tv
                ? "8 цифр на 15 минут, один раз — вводится пультом на телевизоре."
                : `8 цифр на 15 минут, один раз. ${first} ставит приложение на главный экран телефона и вводит код в нём.`}
          </p>
          {lastLine ? (
            <p className="mt-1 text-[13px] leading-[18px]" data-testid="code-last">
              {lastLine}
            </p>
          ) : null}
          <ErrorLine text={error} />
        </div>
        <span ref={issueBox} className="shrink-0">
          <Button size="sm" variant={focus ? "primary" : "secondary"} loading={issue.isPending} onClick={() => doIssue.current(person.id)} data-testid="code-issue">
            {last?.state === "open" ? "Выдать новый код" : "Выдать код"}
          </Button>
        </span>
      </div>
    );
  }

  if (landed) {
    return (
      <div className="flex items-center gap-3 px-4 py-3" data-testid="code-landed">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--ok) 16%, transparent)", color: "var(--ok)" }}>
          {CHECK}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-semibold leading-5">{tv ? "Экран подключён" : "Вход выполнен"}</p>
          <p className="text-[13px] leading-[18px] text-muted">
            {status.data?.device ?? "Устройство"} · {status.data?.used_at ? hm(status.data.used_at) : ""}
          </p>
        </div>
        <Button size="sm" variant="secondary" onClick={onDone}>
          Готово
        </Button>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex items-center gap-4 px-4 py-3" data-testid="code-expired">
        <p className="min-w-0 flex-1 text-[14px] leading-5">Код сгорел — его не ввели за 15 минут.</p>
        <ErrorLine text={error} />
        <Button size="sm" loading={issue.isPending} onClick={() => doIssue.current(person.id)} data-testid="code-issue">
          Выдать новый код
        </Button>
      </div>
    );
  }

  const message = () => codeMessage({ name: person.full_name, company: issued.code.company, code: issued.code.code, expiresAt: issued.code.expires_at, url: issued.code.link });
  return (
    <div className="flex flex-col gap-4 px-4 py-4" data-testid="desk-code-issued">
      <div className="flex items-start gap-5">
        {tv ? null : <QrCode text={issued.code.link} size={176} label={`QR-код: вход в ${issued.code.company}`} />}
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Код входа</p>
          <div className="flex items-center gap-1">
            <span className="nums select-all whitespace-nowrap font-mono text-[26px] font-semibold leading-8 tracking-[0.06em]" data-testid="code-value">
              {formatCode(issued.code.code)}
            </span>
            <CopyButton text={() => issued.code.code} label="Скопировать код" done="Скопировал код" />
          </div>
          <p className="nums text-[13px] leading-[18px] text-muted" data-testid="code-left">
            действует ещё {left(leftMs)}
          </p>
          <p className="mt-1 flex items-center gap-2 text-[13px] leading-[18px]" data-testid="code-waiting">
            <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
            Ждёт входа…
          </p>
        </div>
      </div>
      {tv ? (
        <p className="text-[13px] leading-[18px] text-muted" data-testid="code-address">
          В браузере телевизора — <span className="select-all font-mono text-text">{issued.code.link.replace(/^https?:\/\//, "")}</span>, код — пультом.
        </p>
      ) : (
        <p className="text-[13px] leading-[18px] text-muted">Камера телефона откроет вход по QR. Сначала приложение — на главный экран, потом код.</p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="secondary" onClick={async () => toast((await copyText(message())) ? "Скопировал сообщение с кодом" : "Не получилось скопировать — код можно продиктовать")}>
          Скопировать сообщение
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Готово
        </Button>
      </div>
    </div>
  );
}

/** The email and the first password of a person just created, once: in monospace, to copy. */
function FreshCredentials({ person, email, password, onDone }: { person: Person; email: string; password: string; onDone: () => void }) {
  const first = person.full_name.split(/\s+/)[0] || person.full_name;
  const message = () => loginMessage({ name: person.full_name, email, password, url: window.location.origin });
  return (
    <div className="flex flex-col gap-3 px-4 py-3" data-testid="desk-login-fresh">
      <p className="font-display text-[15px] font-semibold leading-5">{first} — в команде</p>
      <dl className="rounded-[10px] bg-surface-2/70" data-testid="credentials">
        <div className="flex items-center gap-3 px-3 py-1.5">
          <dt className="w-16 shrink-0 text-[13px] leading-5 text-muted">Почта</dt>
          <dd className="min-w-0 flex-1 truncate text-[14px] leading-5">{email}</dd>
          <CopyButton text={() => email} label="Скопировать почту" done="Скопировал почту" />
        </div>
        <div className="flex items-center gap-3 border-t border-border/60 px-3 py-1.5">
          <dt className="w-16 shrink-0 text-[13px] leading-5 text-muted">Пароль</dt>
          <dd className="nums min-w-0 flex-1 select-all font-mono text-[17px] font-semibold leading-6 tracking-[0.04em]" data-testid="credentials-password">
            {password}
          </dd>
          <CopyButton text={() => password} label="Скопировать пароль" done="Скопировал пароль" />
        </div>
      </dl>
      <p className="text-[12px] leading-4 text-muted">Это первый пароль. Свой человек поставит в «Профиле» — старый тогда перестанет работать.</p>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" onClick={async () => toast((await copyText(message())) ? "Скопировал вход" : "Не получилось скопировать — продиктуйте")}>
          Скопировать сообщение
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Готово
        </Button>
      </div>
    </div>
  );
}

/**
 * «Вход» on the person's desk card (D-104, D-135; wave 3): the one-time code with its QR, the
 * email the person signs in with and when they last did, a new password, «Выйти со всех
 * устройств» — a lost phone. The same hooks and words as the phone's `LoginCard`, in rows and
 * dialogs of the desk. `manage` — where `canResetLogin` allows; without it only the login just
 * created is handed over (a new director's, as the phone does). `focus` — opened by «Выдать код
 * входа…» from the team's menu: in sight, the button under the caret, nothing issued.
 */
export function LoginBlock({ person, handed, manage, focus = false }: { person: Person; handed: Handed | null; manage: boolean; focus?: boolean }) {
  const login = usePersonLogin(person.id, manage);
  const reset = useResetPassword();
  const changeEmail = useChangeLoginEmail();
  const revoke = useRevokeSessions();
  const box = useRef<HTMLElement>(null);

  const [dialog, setDialog] = useState<"password" | "email" | "signout" | null>(null);
  const [password, setPassword] = useState("");
  const [done, setDone] = useState(false);
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  // the login just created: shown once, «Готово» puts it away
  const [fresh, setFresh] = useState<Handed | null>(handed);
  // a fresh panel after «Готово»: the code exists only on screen
  const [codeKey, setCodeKey] = useState(0);

  useEffect(() => {
    if (focus) box.current?.scrollIntoView({ block: "center" });
  }, [focus]);

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
      <section ref={box} className="scroll-mt-24 overflow-hidden rounded-[12px] border border-border bg-surface/40" data-testid="desk-login-code" data-focus={focus ? "" : undefined}>
        {freshCredentials ? <FreshCredentials person={person} email={freshCredentials.email} password={freshCredentials.password} onDone={() => setFresh(null)} /> : null}
        {manage || !freshCredentials ? (
          <div className={freshCredentials ? "border-t border-border/60" : ""}>
            <CodePanel
              key={codeKey}
              person={person}
              focus={focus && codeKey === 0}
              // a person just created without an email gets the code at once (the phone's «Добавить»)
              autoIssue={codeKey === 0 && fresh !== null && !freshCredentials}
              onDone={() => {
                setFresh(null);
                setCodeKey((k) => k + 1);
              }}
            />
          </div>
        ) : null}
        {manage ? (
          <div className="border-t border-border/60">
            <Line
              label="Почта"
              value={login.isLoading ? "…" : login.isError ? "не прочиталась" : (shownEmail ?? <span className="text-muted">нет</span>)}
              action={
                login.data ? (
                  <Button size="sm" variant="ghost" className="!min-h-8" onClick={openEmail}>
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
              value={login.data && !shownEmail ? <span className="text-muted">нужна почта</span> : <span className="text-muted">••••••</span>}
              action={
                login.data && !shownEmail ? null : (
                  <Button size="sm" variant="ghost" className="!min-h-8" onClick={openPassword} data-testid="desk-login-password">
                    Сбросить
                  </Button>
                )
              }
            />
            <div className="flex items-center justify-between gap-3 border-t border-border/60 px-4 py-2">
              <span className="min-w-0 truncate text-[12px] leading-4 text-muted">Потерял телефон?</span>
              <Button
                size="sm"
                variant="ghost"
                className="!min-h-8 shrink-0 whitespace-nowrap !text-danger hover:!bg-danger/10"
                onClick={() => {
                  setError(null);
                  setDialog("signout");
                }}
                data-testid="desk-login-signout"
              >
                Выйти со всех устройств
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Dialog open={dialog === "password"} onClose={close} title={done ? "Пароль задан" : `Новый пароль · ${first}`} width="sm">
        {done ? (
          <div className="flex flex-col gap-3">
            <div className="flex items-center gap-2 rounded-[10px] bg-surface-2/70 px-3 py-2">
              <span className="nums min-w-0 flex-1 select-all font-mono text-[19px] font-semibold leading-7 tracking-[0.04em]" data-testid="credentials-password">
                {password}
              </span>
              <CopyButton text={() => password} label="Скопировать пароль" done="Скопировал пароль" />
            </div>
            <p className="text-[13px] leading-[18px] text-muted">Старый пароль больше не работает. Свой пароль можно поставить в «Профиле».</p>
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={async () =>
                  toast((await copyText(loginMessage({ name: person.full_name, email: shownEmail, password, url: window.location.origin }))) ? "Скопировал вход" : "Не получилось скопировать")
                }
              >
                Скопировать сообщение
              </Button>
              <Button size="sm" onClick={close} data-autofocus>
                Готово
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submitPassword} className="flex flex-col gap-3">
            <p className="text-[13px] leading-[18px] text-muted">Предложил пароль — оставьте, возьмите другой ↻ или впишите свой. Старый перестанет работать сразу.</p>
            <PasswordInput value={password} onChange={setPassword} autoFocus />
            <ErrorLine text={error} />
            <div className="flex items-center justify-end gap-2">
              <span className="mr-auto text-[12px] leading-4 text-muted">
                <Kbd>Enter</Kbd> задать
              </span>
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
            spellCheck={false}
            aria-label="Почта"
            className={INPUT}
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
            <Button size="sm" variant="ghost" disabled={revoke.isPending} onClick={close} data-autofocus>
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
