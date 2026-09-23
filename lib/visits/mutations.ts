"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { visitKeys, type Visit, type VisitAnswer } from "./queries";

/**
 * «К вам посетитель» (D-96) — три действия: секретарь объявляет, директор отвечает, карточку
 * убирают. Оффлайн-очереди нет ни у одного намеренно: человек стоит у стола сейчас, и
 * «к вам посетитель», доехавшее через полчаса, хуже честного «нет связи» (то же правило, что
 * у пульта, D-76 §3). Поэтому `networkMode: "always"` перебивает глобальный `offlineFirst`.
 */

const OFFLINE = "Нет связи — директор не узнал. Попробуй ещё раз";
const TIMEOUT_MS = 12_000;

async function withTimeout<T>(call: Promise<T>, message: string): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(message);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), TIMEOUT_MS));
  return Promise.race([call, timeout]);
}

async function post(url: string, body: unknown, message: string): Promise<void> {
  const res = await withTimeout(
    fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    message,
  );
  if (!res.ok) {
    const payload = (await res.json().catch(() => null)) as { error?: { message_ru?: string } } | null;
    throw new Error(payload?.error?.message_ru ?? message);
  }
}

/** Секретарь: «Посетитель». Ключ идемпотентности чеканится в момент тапа (принцип 7). */
export function useAnnounceVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ note, id }: { note: string; id: string }) => {
      await post("/api/visits", { note: note.trim() || undefined, client_request_id: id }, OFFLINE);
    },
    onSuccess: () => {
      toast("Директору сообщено");
      void queryClient.invalidateQueries({ queryKey: visitKeys.root });
    },
    onError: (error: Error) => toast(error.message || OFFLINE),
  });
}

function patchVisit(queryClient: ReturnType<typeof useQueryClient>, id: string, patch: Partial<Visit>) {
  const snapshot = queryClient.getQueryData<Visit[]>(visitKeys.list());
  queryClient.setQueryData<Visit[]>(visitKeys.list(), (old) => (old ?? []).map((v) => (v.id === id ? { ...v, ...patch } : v)));
  return snapshot;
}

/** Директор: «Пусть заходит» / «Подождёт» / «Не приму» — на Пульсе и на пульте. */
export function useAnswerVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ id, answer }: { id: string; answer: VisitAnswer }) => {
      await post(`/api/visits/${id}/answer`, { answer }, "Нет связи — секретарь не узнал");
    },
    onMutate: async ({ id, answer }) => {
      await queryClient.cancelQueries({ queryKey: visitKeys.list() });
      return { snapshot: patchVisit(queryClient, id, { status: answer, answered_at: new Date().toISOString() }) };
    },
    onError: (error: Error, _input, context) => {
      if (context?.snapshot) queryClient.setQueryData(visitKeys.list(), context.snapshot);
      toast(error.message);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: visitKeys.root });
    },
  });
}

/** Убрать карточку: «Отменить», «Готово», «Понятно». Повтор безвреден. */
export function useCloseVisit() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async (id: string) => {
      const supabase = createBrowserSupabase();
      const { error } = await withTimeout(Promise.resolve(supabase.rpc("close_visit", { p_id: id })), "Нет связи");
      if (error) throw new Error(error.message);
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: visitKeys.list() });
      return { snapshot: patchVisit(queryClient, id, { closed_at: new Date().toISOString() }) };
    },
    onError: (_error, _id, context) => {
      if (context?.snapshot) queryClient.setQueryData(visitKeys.list(), context.snapshot);
      toast("Нет связи. Попробуй ещё раз");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: visitKeys.root });
    },
  });
}
