"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import type { NotifyPrefs } from "@/lib/push/prefs";
import { createBrowserSupabase } from "@/lib/supabase/client";

/**
 * The desk shell's own reads and writes (D-154 wave 3): the profile's password and the director's
 * push rules — over the very routes and calls the phone uses, no new ones. Kept here so nothing
 * under `components/desk` or `app/desk` talks to Supabase or the API by itself.
 */

/** The same key as the phone's rules screen (components/notify/NotifySettings.tsx): one cache. */
export const notifyPrefsKey = ["notify-prefs"] as const;

async function fetchPrefs(): Promise<NotifyPrefs> {
  const res = await fetch("/api/me/notifications", { credentials: "include" });
  if (!res.ok) throw new Error("prefs failed");
  return ((await res.json()) as { prefs: NotifyPrefs }).prefs;
}

async function putPrefs(prefs: NotifyPrefs): Promise<NotifyPrefs> {
  const res = await fetch("/api/me/notifications", {
    method: "PUT",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error("prefs failed");
  return ((await res.json()) as { prefs: NotifyPrefs }).prefs;
}

/** The director's push rules (D-114). */
export function useNotifyPrefs(enabled = true) {
  return useQuery({ queryKey: notifyPrefsKey, queryFn: fetchPrefs, enabled });
}

/**
 * Saves the rules at once, optimistic, one save at a time in order (the phone's own scope id):
 * two quick clicks never land out of order; a failure puts the rules back and says so.
 */
export function useSaveNotifyPrefs(onError: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    scope: { id: "notify-prefs" },
    mutationFn: putPrefs,
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: notifyPrefsKey });
      const before = queryClient.getQueryData<NotifyPrefs>(notifyPrefsKey);
      queryClient.setQueryData(notifyPrefsKey, next);
      return { before };
    },
    onError: (_error, _next, context) => {
      if (context?.before) queryClient.setQueryData(notifyPrefsKey, context.before);
      onError();
    },
    onSuccess: (saved) => queryClient.setQueryData(notifyPrefsKey, saved),
  });
}

/**
 * A new password for the person signed in (the phone's «Пароль», D-135): GoTrue refuses one equal
 * to the current, said in plain words.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: async (password: string) => {
      const { error } = await createBrowserSupabase().auth.updateUser({ password });
      if (error) {
        throw new Error(/different|same/i.test(error.message) ? "Это ваш нынешний пароль — придумайте другой" : "Не получилось сменить пароль. Попробуйте ещё раз");
      }
    },
  });
}
