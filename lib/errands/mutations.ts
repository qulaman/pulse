"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { errandKeys, type ErrandStatus } from "@/lib/errands/queries";
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
