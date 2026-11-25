"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { postJson } from "@/lib/api/client";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { visitKeys, type Visit, type VisitAnswer, type VisitKind } from "./queries";

/**
 * «К вам посетитель» (D-96) and «Сообщение на экран» (D-116) — three moves: the secretary
 * announces or writes, the director answers, the card is put away. None has an offline queue,
 * on purpose: the person stands at the desk now, and a «к вам посетитель» that arrives half an hour later
 * is worse than an honest «нет связи» (the same rule as the remote's, D-76 §3); a message on the screen
 * is about what happens now, too. So `networkMode: "always"` overrides the global
 * `offlineFirst`.
 */

const OFFLINE = "Нет связи — директор не узнал. Попробуйте ещё раз";
const TIMEOUT_MS = 12_000;

async function withTimeout<T>(call: Promise<T>, message: string): Promise<T> {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new Error(message);
  const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), TIMEOUT_MS));
  return Promise.race([call, timeout]);
}

async function post(url: string, body: unknown, message: string): Promise<void> {
  await withTimeout(postJson(url, body, { outbox: false, offline: message, fallback: message }), message);
}

/**
 * The secretary: «Посетитель» or «Сообщение». The idempotency key is minted at the tap
 * (принцип 7).
 */
export function useAnnounceVisit(kind: VisitKind = "visitor") {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: async ({ note, id }: { note: string; id: string }) => {
      await post("/api/visits", { note: note.trim() || undefined, client_request_id: id, kind }, OFFLINE);
    },
    onSuccess: () => {
      toast(kind === "message" ? "Сообщение отправлено" : "Директору сообщено");
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

/** The director: «Пусть заходит» / «Подождёт» / «Не приму», to a message — «Понятно»; on Пульс and on the remote. */
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

/** Putting a card away: «Отменить», «Готово», «Понятно». A repeat is harmless. */
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
      toast("Нет связи. Попробуйте ещё раз");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: visitKeys.root });
    },
  });
}
