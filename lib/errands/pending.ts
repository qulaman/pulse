"use client";

import { create } from "zustand";

import { toast } from "@/components/ui/Toast";
import type { SecretaryAction } from "@/lib/settings";

/**
 * «Кофе» уходит сразу (D-101): случайную просьбу теперь не даёт отправить удержание кнопки
 * две секунды, а не пять секунд «Отменить» после тапа (так было по D-79 §5). Строка
 * «отправляю…» висит, пока сервер не принял просьбу; уже ушедшую директор снимает
 * «Отменить» в строке живой заявки (переход `cancelled`, очередь пушей снимается).
 * Отправка живёт вне React: директор может уйти с экрана, заявка всё равно уедет ровно
 * один раз.
 */

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
  /** «не беспокоить на 30 мин» — the request ends by itself (D-99) */
  untilMin?: number | null;
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
      until_min: errand.untilMin ?? undefined,
    }),
  });
  return res.ok;
}

/**
 * The request leaves at once: the line «отправляю…» shows until the server has the row,
 * a short toast says it went (`quiet` — the card that shows the line needs none). `onSent`
 * refreshes the list the row belongs to.
 */
export function askSecretary(
  action: Pick<SecretaryAction, "code" | "label" | "icon">,
  note: string | null,
  onSent: () => void,
  voice?: { id?: string; audioPath?: string | null; transcript?: string | null; inboxId?: string | null },
  options?: { untilMin?: number | null; quiet?: boolean },
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
    untilMin: options?.untilMin ?? null,
  };
  usePendingErrands.getState().add(errand);
  // a panel that stays open shows the line itself; elsewhere (voice, a guest, a meeting, the
  // card over the face that closes on the send, D-101 §5) a toast
  if (!options?.quiet) toast(`${action.label} · отправлено`);
  void send(errand, onSent);
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
