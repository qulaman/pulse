"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { errandKeys, secretaryKeys, type ErrandStatus, type SecretaryPerson } from "@/lib/errands/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type ErrandTransition = {
  id: string;
  to: Extract<ErrandStatus, "accepted" | "done" | "declined" | "cancelled">;
  reason?: string;
};

/**
 * Переходы заявки — только через RPC (политик update у таблицы нет). Идемпотентность
 * на `client_request_id`, как на всякой мутации (принцип 7); гонку двух секретарей
 * разрешает сама функция: опоздавший получает `already_claimed`.
 */
export function useErrandActions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, to, reason }: ErrandTransition) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("transition_errand", {
        p_id: id,
        p_to: to,
        p_reason: reason ?? undefined,
        client_request_id: crypto.randomUUID(),
      });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: errandKeys.root });
    },
    onError: (error: Error) => {
      if (error.message.includes("already_claimed")) {
        toast("Уже приняли");
        void queryClient.invalidateQueries({ queryKey: errandKeys.root });
        return;
      }
      if (error.message.includes("bad_transition") || error.message.includes("forbidden")) {
        toast("Так нельзя: заявка уже изменилась");
        void queryClient.invalidateQueries({ queryKey: errandKeys.root });
        return;
      }
      toast("Не получилось. Попробуй ещё раз");
    },
  });
}

/**
 * «Спасибо» директора за закрытую заявку (D-97) — реакция, не статус. Повтор безвреден: RPC
 * держит время первого «спасибо», ключ идемпотентности — на каждом вызове (принцип 7).
 */
export function useThankErrand() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("thank_errand", { p_id: id, client_request_id: crypto.randomUUID() });
      if (error) throw new Error(error.message);
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: errandKeys.root });
    },
    onError: () => {
      toast("Не получилось. Попробуй ещё раз");
    },
  });
}

/** Причины «Не могу» — чипами, как у задач (принцип 2); без рода (docs/DESIGN.md). */
export const DECLINE_REASONS = ["Сейчас не могу", "Не на месте", "Закончилось"] as const;

/**
 * The short calls around a request (D-99): the promise on «Принял», a question and its
 * answer, the result on «Готово», «Напомнить ещё раз». Each is one RPC with its own
 * idempotency key; a refused one (the request moved on) refreshes the list instead of
 * shouting.
 */
type LinkCall =
  | { fn: "errand_eta"; id: string; min: number }
  | { fn: "errand_ask"; id: string; text: string }
  | { fn: "errand_answer"; id: string; text: string }
  | { fn: "errand_result"; id: string; text: string }
  | { fn: "errand_nudge"; id: string };

async function callLink(call: LinkCall) {
  const supabase = createBrowserSupabase();
  const client_request_id = crypto.randomUUID();
  const { data, error } =
    call.fn === "errand_eta"
      ? await supabase.rpc("errand_eta", { p_id: call.id, p_min: call.min, client_request_id })
      : call.fn === "errand_ask"
        ? await supabase.rpc("errand_ask", { p_id: call.id, p_question: call.text, client_request_id })
        : call.fn === "errand_answer"
          ? await supabase.rpc("errand_answer", { p_id: call.id, p_answer: call.text, client_request_id })
          : call.fn === "errand_result"
            ? await supabase.rpc("errand_result", { p_id: call.id, p_result: call.text, client_request_id })
            : await supabase.rpc("errand_nudge", { p_id: call.id, client_request_id });
  if (error) throw new Error(error.message);
  return data;
}

const DONE_WORD: Record<LinkCall["fn"], string> = {
  errand_eta: "Директор увидит, когда ждать",
  errand_ask: "Спросил директора",
  errand_answer: "Ответ ушёл",
  errand_result: "Передал директору",
  errand_nudge: "Напомнил ещё раз",
};

export function useErrandLink() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: callLink,
    onSuccess: (_data, call) => {
      toast(DONE_WORD[call.fn]);
      void queryClient.invalidateQueries({ queryKey: errandKeys.root });
    },
    onError: (error: Error) => {
      void queryClient.invalidateQueries({ queryKey: errandKeys.root });
      if (error.message.includes("too_soon")) {
        toast("Только что напоминали — подождите минуту");
        return;
      }
      if (error.message.includes("bad_transition") || error.message.includes("forbidden")) {
        toast("Так нельзя: заявка уже изменилась");
        return;
      }
      toast("Не получилось. Попробуй ещё раз");
    },
  });
}

/**
 * «Не на месте до 14:00» (D-99): the secretary's own row, one field — the same value twice is
 * the same state, so a retry is harmless. null — back at the desk.
 */
export function useSetAway(meId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (until: string | null) => {
      const supabase = createBrowserSupabase();
      const { error } = await supabase.from("profiles").update({ away_until: until }).eq("id", meId);
      if (error) throw new Error(error.message);
    },
    // the chip turns at the tap: the secretary sees the new state before the server answers
    onMutate: async (until) => {
      await queryClient.cancelQueries({ queryKey: secretaryKeys.all });
      const before = queryClient.getQueryData<SecretaryPerson[]>(secretaryKeys.all);
      queryClient.setQueryData<SecretaryPerson[]>(secretaryKeys.all, (list) =>
        (list ?? []).map((person) => (person.id === meId ? { ...person, away_until: until } : person)),
      );
      return { before };
    },
    onSuccess: (_data, until) => {
      toast(until ? "Отметил: не на месте" : "Отметил: на месте");
    },
    onError: (_error, _until, context) => {
      if (context?.before) queryClient.setQueryData(secretaryKeys.all, context.before);
      toast("Не получилось. Попробуй ещё раз");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: secretaryKeys.all });
    },
  });
}
