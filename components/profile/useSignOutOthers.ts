"use client";

import { useState } from "react";

import { toast } from "@/components/ui/Toast";
import { useRevokeSessions } from "@/lib/people/queries";
import { thisDeviceEndpoint } from "@/lib/push/client";

/**
 * «Выйти на других устройствах» (D-135), the phone's row and the desk's alike: every other session
 * of the person goes at once with its pushes; this device stays signed in and keeps its own.
 * `open` — the question is on screen; it cannot be closed while the answer is on its way.
 */
export function useSignOutOthers(userId: string) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revoke = useRevokeSessions();
  const ask = () => {
    setError(null);
    setOpen(true);
  };
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
        onError: (failure) => setError(failure.message),
      },
    );
  };
  return { open, error, pending: revoke.isPending, ask, close, submit };
}
