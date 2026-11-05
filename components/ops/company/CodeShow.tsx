"use client";

import { useEffect, useState } from "react";

import { CopyButton } from "@/components/desk/team/fields";
import { Dialog } from "@/components/desk/ui/Dialog";
import { useHoldOpen } from "@/components/ops/useHoldOpen";
import { copyText } from "@/components/people/copy";
import { QrCode } from "@/components/people/QrCode";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { codeMessage, formatCode } from "@/lib/login-code/code";
import type { IssuedCode } from "@/lib/ops/contract";

function hm(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Aqtobe" });
}

function left(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/**
 * A sign-in code in the operator's hands (D-135): the QR large, the eight digits, the address and
 * the minutes left, as the person's card shows it. The code exists in this answer only: what
 * leaves this screen cannot be shown again. What usually happens next — the whole message sent to
 * the person — is the button that takes the focus.
 */
export function CodeShow({ login, tv = false }: { login: IssuedCode; tv?: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  const until = Date.parse(login.expires_at);
  const alive = until > now;

  useEffect(() => {
    if (!alive) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [alive]);

  const message = () => codeMessage({ name: login.name, company: login.company, code: login.code, expiresAt: login.expires_at, url: login.link });
  const address = login.link.replace(/^https?:\/\//, "");

  return (
    <div className="flex flex-col gap-4" data-testid="ops-code">
      <div className="flex items-start gap-5">
        {tv ? null : <QrCode text={login.link} size={176} label={`QR-код: вход в ${login.company}`} />}
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <p className="ops-label">Код входа · {login.name}</p>
          <div className="flex items-center gap-1">
            <span className="nums select-all whitespace-nowrap font-mono text-[26px] font-semibold leading-8 tracking-[0.06em]" data-testid="ops-code-value">
              {formatCode(login.code)}
            </span>
            <CopyButton text={() => login.code} label="Скопировать код" done="Скопировал код" />
          </div>
          <p className="nums text-[13px] leading-[18px]" style={alive ? undefined : { color: "var(--warn)" }} data-testid="ops-code-left">
            {alive ? `Действует ещё ${left(until - now)}, до ${hm(login.expires_at)}` : "Срок вышел: этот код уже не сработает, выдай новый"}
          </p>
          <div className="flex min-w-0 items-center gap-1 text-[13px] leading-[18px] text-muted">
            <span className="min-w-0 select-all truncate font-mono text-text" title={login.link} data-testid="ops-code-address">
              {address}
            </span>
            <CopyButton text={() => login.link} label="Скопировать адрес" done="Скопировал адрес" />
          </div>
        </div>
      </div>
      <div>
        <Button
          size="sm"
          variant="secondary"
          data-autofocus
          autoFocus
          onClick={async () => toast((await copyText(message())) ? "Скопировал сообщение с кодом и ссылкой" : "Не получилось скопировать, код можно продиктовать")}
          data-testid="ops-code-message"
        >
          Скопировать сообщение для человека
        </Button>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">
        {tv ? "Адрес открывается в браузере телевизора, код вводится пультом." : "В сообщении ссылка и код. Пусть сначала поставит приложение на главный экран, потом вводит код; камера телефона откроет ту же ссылку по QR."}
      </p>
      <p className="ops-once text-[13px] leading-[18px]">
        <span className="font-semibold">Код виден один раз:</span> закроешь окно, и его больше не показать, понадобится новый.
      </p>
    </div>
  );
}

/** The same code over a card: a new one from «Люди», a new director's from «Директор». */
export function CodeDialog({ login, tv = false, onClose }: { login: IssuedCode; tv?: boolean; onClose: () => void }) {
  useHoldOpen(true);
  return (
    <Dialog open onClose={onClose} title="Код входа" width="md">
      <div className="flex flex-col gap-4">
        <CodeShow login={login} tv={tv} />
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose} data-testid="ops-code-done">
            Готово
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
