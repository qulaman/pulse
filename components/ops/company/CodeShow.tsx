"use client";

import { useEffect, useState } from "react";

import { CopyButton } from "@/components/desk/team/fields";
import { Dialog } from "@/components/desk/ui/Dialog";
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
 * leaves this screen cannot be shown again.
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
          <p className="text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">Код входа · {login.name}</p>
          <div className="flex items-center gap-1">
            <span className="nums select-all whitespace-nowrap font-mono text-[26px] font-semibold leading-8 tracking-[0.06em]" data-testid="ops-code-value">
              {formatCode(login.code)}
            </span>
            <CopyButton text={() => login.code} label="Скопировать код" done="Скопировал код" />
          </div>
          <p className="nums text-[13px] leading-[18px]" style={alive ? undefined : { color: "var(--warn)" }} data-testid="ops-code-left">
            {alive ? `Действует ещё ${left(until - now)}, до ${hm(login.expires_at)}` : "Срок вышел, нужен новый код"}
          </p>
          <div className="flex min-w-0 items-center gap-1 text-[13px] leading-[18px] text-muted">
            <span className="min-w-0 select-all truncate font-mono text-text" title={login.link} data-testid="ops-code-address">
              {address}
            </span>
            <CopyButton text={() => login.link} label="Скопировать адрес" done="Скопировал адрес" />
          </div>
        </div>
      </div>
      <p className="text-[13px] leading-[18px] text-muted">
        {tv ? "Адрес открывается в браузере телевизора, код вводится пультом. " : "Камера телефона откроет вход по QR. Сначала приложение на главный экран, потом код. "}
        <span className="font-medium text-text">Код виден один раз:</span> закроешь экран, и его больше не показать, понадобится новый.
      </p>
      <div>
        <Button size="sm" variant="secondary" onClick={async () => toast((await copyText(message())) ? "Скопировал сообщение с кодом" : "Не получилось скопировать, код можно продиктовать")}>
          Скопировать сообщение
        </Button>
      </div>
    </div>
  );
}

/** The same code over a card: a new one from «Люди», a new director's from «Директор». */
export function CodeDialog({ login, tv = false, onClose }: { login: IssuedCode; tv?: boolean; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} title="Код входа" width="md">
      <div className="flex flex-col gap-4">
        <CodeShow login={login} tv={tv} />
        <div className="flex justify-end">
          <Button size="sm" onClick={onClose} data-autofocus>
            Готово
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
