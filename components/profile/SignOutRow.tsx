"use client";

import { useRef, useState, type FormEvent } from "react";

import { Row, RowGroup } from "@/components/ui/Row";
import { ExitIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { forgetThisDevice } from "@/lib/push/client";

/**
 * Signing out is one tap away from the tab bar, so it asks first: on a shared phone a
 * stray tap would cost the person their password. The action itself is the server
 * action from the page — the sheet only confirms it.
 */
export function SignOutRow({ action, className = "" }: { action: () => Promise<void>; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const forgotten = useRef(false);

  // this phone stops getting the person's pushes before the session is gone (D-114): the
  // sign-out waits for it at most 1.5 s — no network must not keep anybody signed in
  const submit = (event: FormEvent<HTMLFormElement>) => {
    setPending(true);
    if (forgotten.current) return;
    event.preventDefault();
    const form = event.currentTarget;
    void Promise.race([forgetThisDevice(), new Promise((resolve) => setTimeout(resolve, 1500))]).then(() => {
      forgotten.current = true;
      form.requestSubmit();
    });
  };

  return (
    <>
      <RowGroup className={className}>
        <Row icon={<ExitIcon />} title="Выйти" tone="danger" onClick={() => setOpen(true)} />
      </RowGroup>

      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Выйти из аккаунта?">
        <p className="text-[16px] leading-[22px] text-muted">
          Задачи, сообщения и очки останутся на месте. Чтобы вернуться, понадобится пароль.
        </p>
        <form action={action} onSubmit={submit} className="mt-4 flex flex-col gap-2">
          <Button block type="submit" variant="danger" loading={pending}>
            Выйти
          </Button>
          <Button block variant="ghost" disabled={pending} onClick={() => setOpen(false)}>
            Отмена
          </Button>
        </form>
      </Sheet>
    </>
  );
}
