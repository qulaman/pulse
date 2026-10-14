"use client";

import { useEffect, useRef, useState } from "react";

import { QrCode } from "@/components/people/QrCode";
import { canShare, copyText } from "@/components/people/copy";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { CODE_TTL_SECONDS, codeMessage, formatCode } from "@/lib/login-code/code";
import { useIssueLoginCode, useLoginCodeStatus, type IssuedCode } from "@/lib/people/queries";

/** «14:35» on the clock of Aqtobe. */
function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}

/** «12:41» left on a code. */
function left(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * A one-time sign-in code handed over (D-135): eight digits in large type, how long they
 * live, a QR that opens the company's sign-in screen, «Скопировать» and «Отправить» with a
 * ready message — and the sign-in landing live, «Вход выполнен · iPhone», so the issuer sees it
 * while the person is still in front of them. `self` — the person's own code for another
 * device («Войти на другом устройстве»); `tv` — the wall's kiosk user from the remote: no QR
 * (a TV has no camera), the address in large type, the code typed with the TV's remote. The code exists in this sheet only: closed, it is gone
 * from the app, and a new one cancels it.
 */
export function LoginCodePanel({
  person,
  autoIssue = false,
  self = false,
  tv = false,
  onDone,
}: {
  person: { id: string; full_name: string };
  autoIssue?: boolean;
  self?: boolean;
  tv?: boolean;
  onDone: () => void;
}) {
  const issue = useIssueLoginCode();
  const { mutate } = issue;
  const [issued, setIssued] = useState<{ code: IssuedCode; at: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [shared, setShared] = useState(false);

  // Time left is counted from the moment the answer arrived, not from the server's clock read
  // by this phone's clock: a phone minutes off would otherwise burn a live code on screen.
  const leftMs = issued ? CODE_TTL_SECONDS * 1000 - (now - issued.at) : 0;
  const status = useLoginCodeStatus(person.id, true, issued !== null && leftMs > 0);
  // the code on screen is the one that was used: the same expiry, from the server both times
  const landed =
    issued !== null &&
    status.data?.state === "used" &&
    Date.parse(status.data.expires_at ?? "") === Date.parse(issued.code.expires_at);
  const expired = issued !== null && !landed && leftMs <= 0;

  const first = person.full_name.trim().split(/\s+/)[0] || person.full_name;

  const doIssue = useRef((id: string) => {
    setError(null);
    setShared(false);
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

  // the countdown ticks only while a live code is on screen
  useEffect(() => {
    if (!issued || landed || expired) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [issued, landed, expired]);

  const issueButton = (label: string) => (
    <Button block loading={issue.isPending} onClick={() => doIssue.current(person.id)} data-testid="code-issue">
      {label}
    </Button>
  );
  const errorLine = error ? (
    <p role="alert" className="text-[14px] leading-[18px] text-danger">
      {error}
    </p>
  ) : null;

  if (!issued) {
    if (autoIssue && !error) {
      return (
        <p className="py-10 text-center text-[16px] leading-[22px] text-muted" aria-busy>
          Выдаю код…
        </p>
      );
    }
    const last = status.data;
    return (
      <div className="flex flex-col gap-4">
        <p className="text-[14px] leading-[18px] text-muted">
          {tv
            ? "Код из 8 цифр для экрана: действует 15 минут и срабатывает один раз — вводится пультом на телевизоре."
            : self
            ? "Код из 8 цифр для второго устройства: действует 15 минут и срабатывает один раз."
            : `Код из 8 цифр: действует 15 минут и срабатывает один раз. На телефоне ${first} сначала ставит приложение на главный экран, потом вводит код в нём.`}
        </p>
        {last && last.state !== "none" ? (
          <p className="text-[14px] leading-[18px]" data-testid="code-last">
            {last.state === "used" && last.used_at
              ? `Последний вход по коду — ${last.device ?? "устройство"}, ${humanAqtobe(new Date(last.used_at))}.`
              : last.state === "open" && last.issued_at && last.expires_at
                ? `Код выдан в ${hm(last.issued_at)}${last.issued_by ? ` (${last.issued_by})` : ""} и ждёт входа до ${hm(last.expires_at)}. Новый отменит его.`
                : "Последний код так и не ввели."}
          </p>
        ) : null}
        {errorLine}
        {issueButton(last?.state === "open" ? "Выдать новый код" : "Выдать код")}
      </div>
    );
  }

  if (landed) {
    return (
      <div className="flex flex-col items-center gap-4 py-4 text-center" data-testid="code-landed">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-accent/15 text-accent">
          <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden>
            <path d="m5 12.5 4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <p className="font-display text-[19px] font-semibold leading-6">{tv ? "Экран подключён" : "Вход выполнен"}</p>
        <p className="text-[14px] leading-[18px] text-muted">
          {status.data?.device ?? "Устройство"} · {status.data?.used_at ? hm(status.data.used_at) : ""}
        </p>
        <Button block onClick={onDone}>
          Готово
        </Button>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="flex flex-col gap-4" data-testid="code-expired">
        <p className="text-[16px] leading-[22px]">Код сгорел — его не ввели за 15 минут.</p>
        {errorLine}
        {issueButton("Выдать новый код")}
      </div>
    );
  }

  const message = () =>
    codeMessage({ name: person.full_name, company: issued.code.company, code: issued.code.code, expiresAt: issued.code.expires_at, url: issued.code.link });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-1 rounded-[14px] bg-surface-2 px-4 py-4">
        <span className="nums select-all font-mono text-[34px] font-semibold leading-[42px] tracking-[0.1em]" data-testid="code-value">
          {formatCode(issued.code.code)}
        </span>
        <span className="nums text-[13px] leading-4 text-muted" data-testid="code-left">
          действует ещё {left(leftMs)}
        </span>
      </div>

      {tv ? (
        <div className="flex flex-col gap-1" data-testid="code-address">
          <span className="text-[14px] leading-[18px] text-muted">В браузере телевизора открыть адрес</span>
          <span className="select-all break-all font-mono text-[19px] font-semibold leading-6">{issued.code.link.replace(/^https?:\/\//, "")}</span>
          <span className="text-[14px] leading-[18px] text-muted">и ввести код пультом — экран сам перейдёт на стену.</span>
        </div>
      ) : (
        <div className="flex items-center gap-4">
          <QrCode text={issued.code.link} size={132} label={`QR-код: вход в ${issued.code.company}`} />
          <p className="text-[14px] leading-[18px] text-muted">
            {self
              ? "Камера второго устройства откроет вход по этому QR — код вводится там."
              : "Камера телефона откроет вход по этому QR. Сначала приложение — на главный экран, потом код."}
          </p>
        </div>
      )}

      <p className="flex items-center gap-2 text-[14px] leading-[18px]" data-testid="code-waiting">
        <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-accent" aria-hidden />
        Ждёт входа…
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={async () => toast((await copyText(message())) ? "Скопировал код" : "Не получилось скопировать — код можно продиктовать")}
        >
          Скопировать
        </Button>
        {canShare() ? (
          <Button
            onClick={() => {
              navigator
                .share({ text: message() })
                .then(() => setShared(true))
                .catch(() => undefined); // the share sheet was closed
            }}
          >
            Отправить
          </Button>
        ) : (
          <Button onClick={onDone}>Готово</Button>
        )}
      </div>
      {canShare() ? (
        <Button variant={shared ? "primary" : "ghost"} block onClick={onDone}>
          Готово
        </Button>
      ) : null}
    </div>
  );
}
