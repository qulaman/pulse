"use client";

import { useMutation, useMutationState, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import {
  ALIAS_MAX,
  applyKindEdit,
  applyVocabularyEdit,
  entryKey,
  mergeEntries,
  type KindEdit,
  type VocabularyEdit,
} from "@/lib/dictionary";
import type { Misheard } from "@/lib/dictionary-learn";
import type { WordSuggestion, WordUsage } from "@/lib/dictionary-usage";
import { NetworkError, isNetworkError } from "@/lib/net";
import { dequeue, enqueue } from "@/lib/outbox";
import { peopleKeys, type Person } from "@/lib/people/queries";
import type { CompanySettings } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";

export function useCompanySettings() {
  return useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
}

export type Edit = { add?: string[]; remove?: string[] };
/** `key` is minted at the tap: retries and the replay after a reload are the same call. */
type Keyed<T> = T & { key: string };

const ROOT = ["dictionary"] as const;
const VOCABULARY_MUTATION = [...ROOT, "vocabulary"] as const;
const ALIASES_MUTATION = [...ROOT, "aliases"] as const;
const DISMISS_MUTATION = [...ROOT, "dismiss"] as const;
const DISMISS_WORDS_MUTATION = [...ROOT, "dismiss-words"] as const;
const KINDS_MUTATION = [...ROOT, "kinds"] as const;
export const misheardQueryKey = [...ROOT, "misheard"] as const;
export const wordStatsKey = [...ROOT, "words"] as const;

const WAITING = "Нет связи — правка уйдёт сама, как появится";

/**
 * POST to a dictionary route (D-111). A dead network keeps the call in the persisted outbox
 * (lib/outbox.ts) and throws NetworkError: the mutation pauses and retries while the app is
 * open (QueryProvider, offlineFirst), and OutboxReplay sends it after a closed tab. Every
 * dictionary route has set semantics, so a call that did land and is sent again changes
 * nothing.
 */
async function postDictionary<T>(path: string, payload: unknown, key: string, fallback: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    enqueue({ id: key, path, payload });
    throw new NetworkError(WAITING);
  }
  dequeue(key);
  const body = (await res.json().catch(() => ({}))) as T & { error?: { message_ru?: string } };
  if (!res.ok) throw new Error(body.error?.message_ru ?? fallback);
  return body;
}

/**
 * What an edit that failed means for the screen. No network — nothing: the optimistic
 * state stays, the outbox delivers it. A refusal — the truth is read back and said.
 */
function failed(queryClient: QueryClient, error: unknown, truth: readonly unknown[], fallback: string): void {
  if (isNetworkError(error)) {
    toast(WAITING);
    return;
  }
  void queryClient.invalidateQueries({ queryKey: truth });
  toast(error instanceof Error ? error.message : fallback);
}

/**
 * A word in or out of the vocabulary, its kind, its spelling — on the screen at once
 * (D-111). The server applies the same `applyVocabularyEdit` to the stored list; its
 * answer lands only after the last edit in flight, so a quick second tap is never shown
 * undone and redone. A word added or taken from «Часто встречается» leaves that list.
 */
export function useEditVocabulary() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: VOCABULARY_MUTATION,
    // one after another: «переименовать, затем сменить тип» must reach the server in that order
    scope: { id: "dictionary-words" },
    mutationFn: async ({ key, ...edit }: Keyed<VocabularyEdit>) =>
      (
        await postDictionary<{ settings: CompanySettings }>(
          "/api/settings/vocabulary",
          edit,
          key,
          "Не получилось сохранить словарь",
        )
      ).settings,
    onMutate: async (edit) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<CompanySettings>(settingsKey);
      if (previous) {
        const out = applyVocabularyEdit(
          previous.vocabulary,
          previous.vocabulary_meta,
          edit,
          { at: new Date().toISOString(), by: null },
          previous.word_kinds,
        );
        if (!out.conflict) queryClient.setQueryData<CompanySettings>(settingsKey, { ...previous, vocabulary: out.vocabulary, vocabulary_meta: out.meta });
      }
      if (edit.add?.length) {
        const taken = new Set(edit.add.map(entryKey));
        queryClient.setQueryData<WordStats>(wordStatsKey, (stats) =>
          stats ? { ...stats, suggestions: stats.suggestions.filter((s) => !taken.has(entryKey(s.word))) } : stats,
        );
      }
    },
    onSuccess: (settings) => {
      if (queryClient.isMutating({ mutationKey: VOCABULARY_MUTATION }) === 1) {
        queryClient.setQueryData(settingsKey, settings);
      }
    },
    onError: (error) => failed(queryClient, error, settingsKey, "Не получилось сохранить словарь"),
    onSettled: (_data, error) => {
      // a new or renamed word gets its count once the burst is over
      if (isNetworkError(error) || queryClient.isMutating({ mutationKey: VOCABULARY_MUTATION }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: wordStatsKey });
    },
  });
  return { ...mutation, mutate: (edit: VocabularyEdit) => mutation.mutate({ ...edit, key: crypto.randomUUID() }) };
}

/** `phrases` — how many parsed phrases the month holds: too few, and «не встречалось» means nothing yet. */
/**
 * The company's word types — added, renamed, moved, removed (D-111 §19) — on the screen at
 * once; the server applies the same `applyKindEdit`. A refusal (a name another type has)
 * reads the truth back and says why.
 */
export function useEditKinds() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: KINDS_MUTATION,
    // «Вернуть» is «add» then «move»: the move must find the type already there
    scope: { id: "dictionary-kinds" },
    mutationFn: async ({ key, ...edit }: Keyed<{ edit: KindEdit }>) =>
      (await postDictionary<{ settings: CompanySettings }>("/api/dictionary/kinds", edit.edit, key, "Не получилось сохранить тип"))
        .settings,
    onMutate: async ({ edit }) => {
      await queryClient.cancelQueries({ queryKey: settingsKey });
      const previous = queryClient.getQueryData<CompanySettings>(settingsKey);
      if (!previous) return;
      const out = applyKindEdit(previous.word_kinds, previous.vocabulary_meta, edit);
      if (!out.conflict) queryClient.setQueryData<CompanySettings>(settingsKey, { ...previous, word_kinds: out.kinds, vocabulary_meta: out.meta });
    },
    onSuccess: (settings) => {
      if (queryClient.isMutating({ mutationKey: KINDS_MUTATION }) === 1) queryClient.setQueryData(settingsKey, settings);
    },
    onError: (error) => failed(queryClient, error, settingsKey, "Не получилось сохранить тип"),
  });
  return { ...mutation, mutate: (edit: KindEdit) => mutation.mutate({ edit, key: crypto.randomUUID() }) };
}

export type WordStats = { days: number; phrases: number; usage: Record<string, WordUsage>; suggestions: WordSuggestion[] };

/**
 * How often each word came up in the last month and the names that keep coming up without
 * being in the vocabulary (`GET /api/dictionary/words`) — numbers and words, never phrases.
 */
export function useWordStats() {
  return useQuery({
    queryKey: wordStatsKey,
    staleTime: 60_000,
    queryFn: async (): Promise<WordStats> => {
      const res = await fetch("/api/dictionary/words", { credentials: "include" });
      if (!res.ok) throw new Error("word stats failed");
      return (await res.json()) as WordStats;
    },
  });
}

/** «×» on a suggested word: gone at once, hidden for everybody who runs the dictionary. */
export function useDismissWords() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: DISMISS_WORDS_MUTATION,
    mutationFn: ({ key, dismiss }: Keyed<{ dismiss: string[] }>) =>
      postDictionary<{ dismissed_words: string[] }>("/api/dictionary/words", { dismiss }, key, "Не получилось скрыть"),
    onMutate: ({ dismiss }) => {
      const hidden = new Set(dismiss);
      queryClient.setQueryData<WordStats>(wordStatsKey, (stats) =>
        stats ? { ...stats, suggestions: stats.suggestions.filter((s) => !hidden.has(s.key)) } : stats,
      );
    },
    onError: (error) => failed(queryClient, error, wordStatsKey, "Не получилось скрыть"),
  });
  return { ...mutation, mutate: (dismiss: string[]) => mutation.mutate({ dismiss, key: crypto.randomUUID() }) };
}

/** Puts an alias edit on the cached people at once — the screen does not wait for the server. */
function patchPeople(queryClient: QueryClient, id: string, edit: Edit): void {
  const people = queryClient.getQueryData<Person[]>(peopleKeys.all);
  if (!people) return;
  queryClient.setQueryData<Person[]>(
    peopleKeys.all,
    people.map((p) => (p.id === id ? { ...p, aliases: mergeEntries(p.aliases, edit.add ?? [], edit.remove ?? [], ALIAS_MAX).list } : p)),
  );
}

/**
 * The spoken names of one person, on the screen at once. The server merges against the row
 * as it is now (POST /api/dictionary/aliases) under the caller's RLS — the director and the
 * secretary may both be editing, and a stale list would drop the other one's names (D-104).
 * A remembered form stops being a lesson, so «Из ваших записей» is read again after it.
 */
export function useEditAliases() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: ALIASES_MUTATION,
    mutationFn: ({ key, id, ...edit }: Keyed<Edit & { id: string }>) =>
      postDictionary<{ id: string; aliases: string[] }>(
        "/api/dictionary/aliases",
        { person_id: id, ...edit },
        key,
        "Не получилось сохранить имя",
      ),
    onMutate: async ({ id, add, remove }) => {
      await queryClient.cancelQueries({ queryKey: peopleKeys.all });
      patchPeople(queryClient, id, { add, remove });
      // a form taken from «Из ваших записей» leaves the list at once
      if (add?.length) {
        const taken = new Set(add.map((form) => `${id}:${entryKey(form)}`));
        queryClient.setQueryData<Misheard[]>(misheardQueryKey, (items) => items?.filter((item) => !taken.has(item.key)));
      }
    },
    onError: (error) => failed(queryClient, error, peopleKeys.all, "Не получилось сохранить имя"),
    onSettled: (_data, error) => {
      if (isNetworkError(error)) return;
      // a refetch in the middle of a burst would briefly show the next edit undone
      if (queryClient.isMutating({ mutationKey: ALIASES_MUTATION }) > 1) return;
      void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      void queryClient.invalidateQueries({ queryKey: ["roster"] });
      void queryClient.invalidateQueries({ queryKey: misheardQueryKey });
    },
  });
  return {
    ...mutation,
    mutate: (edit: Edit & { id: string }) => mutation.mutate({ ...edit, key: crypto.randomUUID() }),
  };
}

/**
 * «Из ваших записей» (D-111, second wave): the names the AI could not place and the person
 * the director placed them on — from the server, which alone may read the parse log.
 */
export function useMisheard(enabled = true) {
  return useQuery({
    queryKey: misheardQueryKey,
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Misheard[]> => {
      const res = await fetch("/api/dictionary/misheard", { credentials: "include" });
      if (!res.ok) throw new Error("misheard failed");
      return ((await res.json()) as { items: Misheard[] }).items;
    },
  });
}

/** «×» on a lesson: gone from the list at once, hidden for everybody who runs the dictionary. */
export function useDismissMisheard() {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationKey: DISMISS_MUTATION,
    mutationFn: ({ key, dismiss }: Keyed<{ dismiss: string[] }>) =>
      postDictionary<{ dismissed: string[] }>("/api/dictionary/misheard", { dismiss }, key, "Не получилось скрыть"),
    onMutate: ({ dismiss }) => {
      const hidden = new Set(dismiss);
      queryClient.setQueryData<Misheard[]>(misheardQueryKey, (items) => items?.filter((item) => !hidden.has(item.key)));
    },
    onError: (error) => failed(queryClient, error, misheardQueryKey, "Не получилось скрыть"),
  });
  return { ...mutation, mutate: (dismiss: string[]) => mutation.mutate({ dismiss, key: crypto.randomUUID() }) };
}

/**
 * Edits still waiting for the network — a paused mutation or one that already lost a try —
 * so the chip can say «ждёт связи» instead of pretending it is saved. An ordinary edit in
 * flight for 200 ms is not «waiting».
 */
export function useWaitingEdits(): { words: Set<string>; aliases: Set<string>; count: number } {
  const waiting = useMutationState({
    filters: { mutationKey: ROOT, status: "pending" },
    select: (mutation) => ({
      kind: mutation.options.mutationKey?.[1] as string | undefined,
      variables: mutation.state.variables as (Edit & { id?: string }) | undefined,
      waiting: mutation.state.isPaused || mutation.state.failureCount > 0,
    }),
  }).filter((m) => m.waiting);

  const words = new Set<string>();
  const aliases = new Set<string>();
  for (const m of waiting) {
    for (const form of m.variables?.add ?? []) {
      if (m.kind === "vocabulary") words.add(entryKey(form));
      if (m.kind === "aliases" && m.variables?.id) aliases.add(`${m.variables.id}:${entryKey(form)}`);
    }
  }
  return { words, aliases, count: waiting.length };
}
