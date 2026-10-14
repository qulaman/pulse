"use client";

import { useState } from "react";

import { ExitIcon } from "@/components/profile/icons";
import { Button } from "@/components/ui/Button";
import { Row } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useRevokeSessions } from "@/lib/people/queries";
import { thisDeviceEndpoint } from "@/lib/push/client";

/**
 * «Выйти на других устройствах» (D-135): a phone left at home, a tablet given away — every
 * other session of this person goes at once with its pushes; this phone stays signed in and
 * keeps its own notifications.
 */
export function SignOutOthersRow({ userId }: { userId: string }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevokeSessions();
  const close = () => !revoke.isPending && setOpen(false);

  const submit = async () => {
    setError(null);
    const keepEndpoint = await thisDeviceEndpoint();
    revoke.mutate(
      { id: userId, keepCurrent: true, keepEndpoint },
      {
        onSuccess: ({ sessions }) => {
          toast(sessions > 0 ? `Вход закрыт на других устройствах · ${sessions}` : "Других входов не было");
          setOpen(false);
        },
        onError: (e) => setError(e.message),
      },
    );
  };

  return (
    <>
      <Row
        icon={<ExitIcon />}
        title="Выйти на других устройствах"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
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
          <Button block variant="danger" loading={revoke.isPending} onClick={() => void submit()} data-testid="revoke-others">
            Выйти на других устройствах
          </Button>
          <Button block variant="ghost" disabled={revoke.isPending} onClick={close}>
            Отмена
          </Button>
        </div>
      </Sheet>
    </>
  );
}
