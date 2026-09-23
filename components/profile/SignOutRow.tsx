"use client";

import { useState } from "react";

import { Row, RowGroup } from "@/components/ui/Row";
import { ExitIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";

/**
 * Signing out is one tap away from the tab bar, so it asks first: on a shared phone a
 * stray tap would cost the person their password. The action itself is the server
 * action from the page — the sheet only confirms it.
 */
export function SignOutRow({ action, className = "" }: { action: () => Promise<void>; className?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  return (
    <>
      <RowGroup className={className}>
        <Row icon={<ExitIcon />} title="Выйти" tone="danger" onClick={() => setOpen(true)} />
      </RowGroup>

      <Sheet open={open} onClose={() => !pending && setOpen(false)} title="Выйти из аккаунта?">
        <p className="text-[16px] leading-[22px] text-muted">
          Задачи, сообщения и очки останутся на месте. Чтобы вернуться, понадобится пароль.
        </p>
        <form action={action} onSubmit={() => setPending(true)} className="mt-4 flex flex-col gap-2">
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
