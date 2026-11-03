"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { toast } from "@/components/ui/Toast";
import { DEMO_RESET_WORD, useResetDemo } from "@/lib/desk/settings-queries";

/**
 * «Обнулить…» and its dialog: the one irreversible button of the app asks for a word, typed, before
 * «Стереть всё» wakes up; Enter in the field presses it only then. After the reset every cached list
 * is stale — the desk starts over from its home.
 */
export function DemoResetButton() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const reset = useResetDemo();
  const queryClient = useQueryClient();
  const router = useRouter();
  const ready = typed === DEMO_RESET_WORD && !reset.isPending;

  const close = () => {
    setOpen(false);
    setTyped("");
  };
  const run = () => {
    if (!ready) return;
    reset.mutate(undefined, {
      onSuccess: (message) => {
        toast(message);
        close();
        queryClient.clear();
        router.push("/desk");
      },
      onError: (error) => toast(error instanceof Error ? error.message : "Не получилось обнулить"),
    });
  };

  return (
    <>
      <Button size="sm" variant="danger" onClick={() => setOpen(true)}>
        Обнулить…
      </Button>
      <Dialog open={open} onClose={close} title="Обнулить демо-базу" width="sm">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run();
          }}
          className="flex flex-col gap-4"
        >
          <p className="text-[14px] leading-5 text-muted">
            Это не отменить. Чтобы подтвердить, напишите слово <span className="font-semibold text-text">{DEMO_RESET_WORD}</span>.
          </p>
          <input
            data-autofocus
            value={typed}
            onChange={(event) => setTyped(event.target.value.trim().toUpperCase())}
            placeholder={DEMO_RESET_WORD}
            aria-label="Слово подтверждения"
            autoComplete="off"
            className="field h-9 px-3 text-[14px] leading-5 outline-none"
          />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={close}>
              Не сейчас
            </Button>
            <Button size="sm" variant="danger" type="submit" loading={reset.isPending} disabled={!ready}>
              Стереть всё
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
