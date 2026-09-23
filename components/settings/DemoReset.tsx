"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { TrashIcon } from "@/components/settings/icons";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";

const WORD = "ОБНУЛИТЬ";
const FIELD =
  "min-h-[44px] w-full field px-3 text-[16px] leading-[22px] outline-none transition-colors duration-[120ms] focus:border-accent";

/**
 * «Обнулить демо-базу» — the demo instance starts over: every task, message, announcement,
 * award, AI log and uploaded file of the company is gone; people, settings and the
 * phones' push subscriptions stay. Rendered only when NEXT_PUBLIC_DEMO_MODE=1; the
 * server refuses without DEMO_RESET_ENABLED=1, so a client's production has neither.
 */
export function DemoReset() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const router = useRouter();

  const close = () => {
    setOpen(false);
    setTyped("");
  };

  const reset = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/reset-demo", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirm: WORD }),
      });
      const body = (await res.json().catch(() => null)) as { message_ru?: string; error?: { message_ru?: string } } | null;
      if (!res.ok) throw new Error(body?.error?.message_ru ?? "Не получилось обнулить");
      toast(body?.message_ru ?? "Обнулил");
      close();
      // every cached list is stale now — start the app over from Пульс
      queryClient.clear();
      router.push("/pulse");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Не получилось обнулить");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card px-4 py-4">
      {/* the one irreversible button of the app wears the same section header as the rest, in red */}
      <div className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
          style={{ background: "color-mix(in srgb, var(--danger) 14%, transparent)", color: "var(--danger)" }}
        >
          <TrashIcon />
        </span>
        <p className="font-display text-[17px] font-semibold leading-[22px] tracking-[-0.01em]">Обнулить демо-базу</p>
      </div>
      <p className="mt-2 text-[13px] leading-[18px] text-muted">
        Сотрёт все задачи, переписку, объявления, начисления, логи разбора и загруженные файлы компании. Люди и настройки останутся.
      </p>
      <div className="mt-3">
        <Button variant="danger" onClick={() => setOpen(true)}>
          Обнулить…
        </Button>
      </div>

      <Sheet open={open} onClose={close} title="Обнулить демо-базу">
        <p className="text-[16px] leading-[22px] text-muted">
          Это не отменить. Чтобы подтвердить, напиши слово <span className="font-semibold text-text">{WORD}</span>.
        </p>
        <input
          value={typed}
          onChange={(event) => setTyped(event.target.value.trim().toUpperCase())}
          placeholder={WORD}
          aria-label="Слово подтверждения"
          autoComplete="off"
          className={`mt-3 ${FIELD}`}
        />
        <div className="mt-4 flex gap-2">
          <Button variant="danger" block loading={busy} disabled={typed !== WORD || busy} onClick={reset}>
            Стереть всё
          </Button>
          <Button variant="secondary" block onClick={close}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </div>
  );
}
