"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { ALIAS_MAX, VOCABULARY_MAX, mergeEntries } from "@/lib/dictionary";
import { peopleKeys, type Person } from "@/lib/people/queries";
import type { CompanySettings } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";
import { createBrowserSupabase } from "@/lib/supabase/client";

export function useCompanySettings() {
  return useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
}

export type Edit = { add?: string[]; remove?: string[] };

const VOCABULARY_MUTATION = ["dictionary", "vocabulary"] as const;
const ALIASES_MUTATION = ["dictionary", "aliases"] as const;

/**
 * A word in or out of the vocabulary, on the screen at once (D-111). The server merges
 * against the stored list; its answer lands only after the last edit in flight, so a
 * quick second tap is never shown undone and redone.
 */
export function useEditVocabulary() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: VOCABULARY_MUTATION,
    mutationFn: async (edit: Edit): Promise<CompanySettings> => {
      const res = await fetch("/api/settings/vocabulary", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(edit),
      });
      const body = (await res.json().catch(() => ({}))) as {
        settings?: CompanySettings;
        error?: { message_ru?: string };
      };
      if (!res.ok || !body.settings) throw new Error(body.error?.message_ru ?? "Не получилось сохранить словарь");
      return body.settings;
    },
    onMutate: async (edit) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<CompanySettings>(settingsKey);
      if (previous) {
        const { list } = mergeEntries(previous.vocabulary, edit.add ?? [], edit.remove ?? [], VOCABULARY_MAX);
        queryClient.setQueryData<CompanySettings>(settingsKey, { ...previous, vocabulary: list });
      }
      return { previous };
    },
    onSuccess: (settings) => {
      if (queryClient.isMutating({ mutationKey: VOCABULARY_MUTATION }) === 1) {
        queryClient.setQueryData(settingsKey, settings);
      }
    },
    onError: (error, _edit, context) => {
      if (context?.previous) queryClient.setQueryData(settingsKey, context.previous);
      toast(error instanceof Error ? error.message : "Не получилось сохранить словарь");
    },
  });
}

/**
 * Aliases of one person, on the screen at once. The row is merged as it is now, not as
 * this screen last saw it: the director and the secretary may both be editing, and a
 * stale list would silently drop the other one's names. RLS and trg_profiles_guard
 * decide who may touch the row (D-104); an empty answer is a refusal.
 */
export function useEditAliases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: ALIASES_MUTATION,
    mutationFn: async ({ id, add = [], remove = [] }: Edit & { id: string }) => {
      const supabase = createBrowserSupabase();
      const read = await supabase.from("profiles").select("aliases").eq("id", id).single();
      if (read.error) throw new Error(read.error.message);
      const { list } = mergeEntries(read.data.aliases ?? [], add, remove, ALIAS_MAX);
      const { data, error } = await supabase.from("profiles").update({ aliases: list }).eq("id", id).select("id");
      if (error) throw new Error(error.message);
      if (!data?.length) throw new Error("not_permitted");
    },
    onMutate: async ({ id, add = [], remove = [] }) => {
      await queryClient.cancelQueries({ queryKey: peopleKeys.all });
      const previous = queryClient.getQueryData<Person[]>(peopleKeys.all);
      if (previous) {
        queryClient.setQueryData<Person[]>(
          peopleKeys.all,
          previous.map((p) => (p.id === id ? { ...p, aliases: mergeEntries(p.aliases, add, remove, ALIAS_MAX).list } : p)),
        );
      }
      return { previous };
    },
    onError: (error, _edit, context) => {
      if (context?.previous) queryClient.setQueryData(peopleKeys.all, context.previous);
      const message = error instanceof Error ? error.message : "";
      toast(message.includes("not_permitted") ? "Эту карточку тебе менять нельзя" : "Не получилось сохранить имя");
    },
    onSettled: () => {
      // a refetch in the middle of a burst would briefly show the next edit undone
      if (queryClient.isMutating({ mutationKey: ALIASES_MUTATION }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
    },
  });
}
