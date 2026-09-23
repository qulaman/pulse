"use client";

import { useState } from "react";

import { canShare, copyText } from "@/components/people/copy";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { loginMessage } from "@/lib/people/password";

/**
 * A login handed over once: the email and the password in large type, «Скопировать» and
 * «Отправить» (the phone's share sheet — WhatsApp, Telegram) with a ready message, so
 * nobody retypes a password from the screen (D-104). Nothing here is stored: close the
 * sheet and the password is gone from the app.
 */
export function Credentials({
  name,
  email,
  password,
  note,
  onDone,
}: {
  name: string;
  email: string | null;
  password: string;
  note: string;
  onDone: () => void;
}) {
  const [shared, setShared] = useState(false);
  const message = () => loginMessage({ name, email, password, url: window.location.origin });

  return (
    <div className="flex flex-col gap-4">
      <dl className="rounded-[14px] bg-surface-2 px-4 py-3" data-testid="credentials">
        {email ? (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="shrink-0 text-[13px] leading-4 text-muted">Почта</dt>
            <dd className="min-w-0 truncate text-right text-[16px] leading-[22px]">{email}</dd>
          </div>
        ) : null}
        <div className={`flex items-baseline justify-between gap-3 ${email ? "mt-2 border-t border-border/70 pt-2" : ""}`}>
          <dt className="shrink-0 text-[13px] leading-4 text-muted">Пароль</dt>
          <dd className="nums select-all font-mono text-[22px] font-semibold leading-[30px] tracking-[0.04em]" data-testid="credentials-password">
            {password}
          </dd>
        </div>
      </dl>
      <p className="text-[13px] leading-4 text-muted">{note}</p>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="secondary"
          onClick={async () => toast((await copyText(message())) ? "Скопировал вход" : "Не получилось скопировать — продиктуй")}
        >
          Скопировать
        </Button>
        {canShare() ? (
          <Button
            onClick={() => {
              navigator
                .share({ text: message() })
                .then(() => setShared(true))
                .catch(() => undefined); // the person closed the share sheet
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
