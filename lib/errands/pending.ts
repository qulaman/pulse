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
  /** Голосовой путь (D-79, фаза D): запись уже в Storage, её нельзя потерять (принцип 5). */
  audioPath?: string | null;
  transcript?: string | null;
  inboxId?: string | null;
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
      audio_path: errand.audioPath ?? undefined,
      source_transcript: errand.transcript ?? undefined,
      inbox_item_id: errand.inboxId ?? undefined,
    }),
  });
  return res.ok;
}

/**
 * Tap → the line appears at once, the toast counts five seconds, then the row is
 * written. `onSent` refreshes the list the row belongs to.
 */
export function askSecretary(
  action: Pick<SecretaryAction, "code" | "label" | "icon">,
  note: string | null,
  onSent: () => void,
  voice?: { id?: string; audioPath?: string | null; transcript?: string | null; inboxId?: string | null },
): string {
  const errand: PendingErrand = {
    // голос приносит свой ключ запроса: повтор той же фразы не купит второй кофе
    id: voice?.id ?? crypto.randomUUID(),
    code: action.code,
    label: action.label,
    icon: action.icon,
    note,
    audioPath: voice?.audioPath ?? null,
    transcript: voice?.transcript ?? null,
    inboxId: voice?.inboxId ?? null,
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
    setTimeout(() => {
      timers.delete(errand.id);
      void send(errand, onSent);
    }, HOLD_MS),
  );

  return errand.id;
}

/**
 * The row leaves the pending list only once the server has it. A failed post (no
 * network, a 5xx) keeps the line on the screen with «Повторить»: the request id is the
 * same, so a retry after the network is back buys one cup, not two (principle 7).
 */
async function send(errand: PendingErrand, onSent: () => void): Promise<void> {
  let ok = false;
  try {
    ok = await postErrand(errand);
  } catch {
    ok = false;
  }
  if (ok) {
    usePendingErrands.getState().drop(errand.id);
    onSent();
    return;
  }
  toast("Не получилось отправить", {
    lifetimeMs: 10_000,
    action: { label: "Повторить", onClick: () => void send(errand, onSent) },
  });
}

export function cancelErrand(id: string, toastId?: number): void {
  const timer = timers.get(id);
  if (timer) clearTimeout(timer);
  timers.delete(id);
  usePendingErrands.getState().drop(id);
  if (toastId !== undefined) dismissToast(toastId);
  toast("Отменил");
}
