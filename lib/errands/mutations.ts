"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { errandKeys, secretaryKeys, type ErrandStatus, type SecretaryPerson } from "@/lib/errands/queries";
import { kickPush } from "@/lib/push/client";
import { createBrowserSupabase } from "@/lib/supabase/client";

export type ErrandTransition = {
  id: string;
  to: Extract<ErrandStatus, "accepted" | "done" | "declined" | "cancelled">;
  reason?: string;
};

/**
 * An errand moves only through an RPC (the table has no update policies). Idempotent
 * on `client_request_id`, like every mutation (principle 7); the race of two secretaries
 * is settled by the function itself: the late one gets `already_claimed`.
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
      // «Принято» / «Не выйдет» reach the director now, not on the minute sweep (D-114)
      kickPush();
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
      toast("Не получилось. Попробуйте ещё раз");
      // the desk's «Отменить» paints the row first (components/desk/errands/cancel.tsx)
      void queryClient.invalidateQueries({ queryKey: errandKeys.root });
    },
  });
}

/**
 * The director's «Спасибо» for a closed errand (D-97) — a reaction, not a status. A repeat is harmless: the RPC
 * keeps the time of the first «спасибо», the idempotency key is on every call (principle 7).
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
      toast("Не получилось. Попробуйте ещё раз");
    },
  });
}

/** The reasons of «Не могу» — as chips, like a task's (principle 2); no grammatical gender (docs/DESIGN.md). */
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
  kickPush();
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
      toast("Не получилось. Попробуйте ещё раз");
    },
  });
}

/**
 * «Не на месте до 14:00» (D-99): the secretary's own row, one field — the same value twice is
 * the same state, so a retry is harmless. null — back at the desk.
 */
/** `quiet` — the caller says it in its own words (the desk's «Отметил: на месте» with «Отменить», D-175). */
export function useSetAway(meId: string, { quiet = false }: { quiet?: boolean } = {}) {
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
      if (!quiet) toast(until ? "Отметил: не на месте" : "Отметил: на месте");
    },
    onError: (_error, _until, context) => {
      if (context?.before) queryClient.setQueryData(secretaryKeys.all, context.before);
      toast("Не получилось. Попробуйте ещё раз");
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: secretaryKeys.all });
    },
  });
}
