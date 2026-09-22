"use client";

import { create } from "zustand";

import { dismissToast, toast } from "@/components/ui/Toast";
import type { SecretaryAction } from "@/lib/settings";

/**
 * «Кофе» уходит не сразу: пять секунд тост держит «Отменить», и только по их
 * истечении строка появляется в базе (D-79 §6). Причина — квитанции: пуш секретарю
 * летит сразу после вставки, отменять его было бы поздно, поэтому отменяется не пуш,
 * а сама отправка. Таймер живёт вне React: директор может уйти с экрана, заявка всё
 * равно уедет ровно один раз.
 */

const HOLD_MS = 5_000;

export type PendingErrand = {
  /** The client request id: the same uuid the row will carry, so a retry is idempotent. */
  id: string;
  code: string;
  label: string;
  icon: string;
  note: string | null;
};

type PendingState = {
  pending: PendingErrand[];
  add: (errand: PendingErrand) => void;
  drop: (id: string) => void;
};

export const usePendingErrands = create<PendingState>((set) => ({
  pending: [],
  add: (errand) => set((state) => ({ pending: [errand, ...state.pending] })),
  drop: (id) => set((state) => ({ pending: state.pending.filter((p) => p.id !== id) })),
}));

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export async function postErrand(errand: PendingErrand): Promise<boolean> {
  const res = await fetch("/api/errands", {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: errand.code,
      note: errand.note ?? undefined,
      client_request_id: errand.id,
    }),
  });
  return res.ok;
}

/**
 * Tap → the line appears at once, the toast counts five seconds, then the row is
 * written. `onSent` refreshes the list the row belongs to.
 */
export function askSecretary(action: SecretaryAction, note: string | null, onSent: () => void): string {
  const errand: PendingErrand = {
    id: crypto.randomUUID(),
    code: action.code,
    label: action.label,
    icon: action.icon,
    note,
  };
  usePendingErrands.getState().add(errand);

  const toastId = toast(`${action.label} · отправляю`, {
    lifetimeMs: HOLD_MS,
    action: {
      label: "Отменить",
      onClick: () => cancelErrand(errand.id, toastId),
    },
  });

  timers.set(
    errand.id,
    setTimeout(async () => {
      timers.delete(errand.id);
      const ok = await postErrand(errand);
      usePendingErrands.getState().drop(errand.id);
      if (!ok) toast("Не получилось отправить. Попробуй ещё раз");
      onSent();
    }, HOLD_MS),
  );

  return errand.id;
}

export function cancelErrand(id: string, toastId?: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  usePendingErrands.getState().drop(id);
  if (toastId !== undefined) dismissToast(toastId);
  toast("Отменил");
}
