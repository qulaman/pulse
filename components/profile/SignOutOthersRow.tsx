"use client";

import { ExitIcon } from "@/components/profile/icons";
import { useSignOutOthers } from "@/components/profile/useSignOutOthers";
import { Button } from "@/components/ui/Button";
import { Row } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";

/**
 * «Выйти на других устройствах» (D-135): a phone left at home, a tablet given away — every
 * other session of this person goes at once with its pushes; this phone stays signed in and
 * keeps its own notifications.
 */
export function SignOutOthersRow({ userId }: { userId: string }) {
  const { open, error, pending, ask, close, submit } = useSignOutOthers(userId);

  return (
    <>
      <Row
        icon={<ExitIcon />}
        title="Выйти на других устройствах"
        onClick={ask}
      />
      <Sheet open={open} onClose={close} title="Выйти на других устройствах?">
        <div className="flex flex-col gap-3">
          <p className="text-[16px] leading-[22px] text-muted">
            Вход закроется на всех телефонах и компьютерах, кроме этого, и уведомления на них перестанут приходить.
          </p>
          {error ? (
            <p role="alert" className="text-[14px] leading-[18px] text-danger">
              {error}
            </p>
          ) : null}
          <Button block variant="danger" loading={pending} onClick={() => void submit()} data-testid="revoke-others">
            Выйти на других устройствах
          </Button>
          <Button block variant="ghost" disabled={pending} onClick={close}>
            Отмена
          </Button>
        </div>
      </Sheet>
    </>
  );
}
