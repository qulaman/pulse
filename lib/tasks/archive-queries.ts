"use client";

import { useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { create } from "zustand";

import { appendPage, ARCHIVE_STATUSES, foldFirstPage, rangeBounds, searchWords, wordPattern, type ArchiveStatus, type DayRange } from "@/lib/desk/archive";
import { useRealtimeInvalidate } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { useDebounced } from "@/lib/useDebounced";

import { CLOSED_PAGE, CLOSED_STATUSES, TASK_SELECT, taskKeys, type TaskWithPeople } from "./query-core";

/* -------------------------------------------------------------------------- */
/* The desk's archive and search: all of history, read from the server         */
/* -------------------------------------------------------------------------- */

/** A search asks once per pause, not per letter. */
const SEARCH_PAUSE_MS = 250;
/** How many rows one answer of a search brings: the people's lists are short, the rest is one more word away. */
export const SEARCH_HITS = 30;

const NO_TASKS: TaskWithPeople[] = [];
const NO_PEOPLE: readonly string[] = [];

/** How many rows each archive and each search has on the server, by its key — kept beside the list, which stays a plain array. */
const useTotals = create<Record<string, number>>(() => ({}));

export type ArchiveFilter = { range: DayRange | null; who: string | null; status: ArchiveStatus | null; text: string };

type ArchiveScope = ArchiveFilter & { author: string | null };

const closedOrder = (task: TaskWithPeople) => task.closed_at ?? task.updated_at;

async function fetchArchivePage(scope: ArchiveScope, offset: number, signal?: AbortSignal): Promise<{ rows: TaskWithPeople[]; total: number }> {
  const supabase = createBrowserSupabase();
  const { gte, lt } = rangeBounds(scope.range);
  let request = supabase
    .from("tasks")
    .select(TASK_SELECT, { count: "exact" })
    .in("status", scope.status ? [scope.status] : [...ARCHIVE_STATUSES]);
  if (scope.author) request = request.eq("author_id", scope.author);
  if (scope.who) request = request.eq("assignee_id", scope.who);
  if (gte) request = request.gte("closed_at", gte);
  if (lt) request = request.lt("closed_at", lt);
  for (const word of searchWords(scope.text)) request = request.ilike("title", wordPattern(word));
  let ordered = request
    .order("closed_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .order("id")
    .range(offset, offset + CLOSED_PAGE - 1);
  if (signal) ordered = ordered.abortSignal(signal);
  const { data, count, error } = await ordered;
  if (error) throw new Error(error.message);
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * «Закрытые» as an archive (D-130, the desk's second wave): done and recalled tasks of a range of
 * days, by the server, a page at a time. The list is the director's own, as «Задачи» is; a search
 * goes over everything `tasks_select` lets the person see — the company's boundary is RLS's,
 * `company_id = auth_company_id()` stands in the policy as a condition of its own. The rows stay a
 * plain array under the tasks' root, so an optimistic patch and a delete find them. «Показать ещё»
 * asks for the next page alone, an event for the first page alone (`foldFirstPage`): the phone's
 * limit-and-refetch would cost more with every page, and stop dead at PostgREST's max_rows.
 */
export function useTaskArchive(userId: string, filter: ArchiveFilter, enabled = true) {
  const queryClient = useQueryClient();
  const text = useDebounced(filter.text, SEARCH_PAUSE_MS);
  const typed = searchWords(text).join(" ");
  const scope: ArchiveScope = { ...filter, text: typed, author: typed ? null : userId };
  const name = JSON.stringify([scope.author, scope.range, scope.who, scope.status, scope.text]);
  const queryKey = taskKeys.archive(name);
  const [loadingMore, setLoadingMore] = useState(false);

  const query = useQuery({
    queryKey,
    enabled,
    // a whole archive has no place in the phone's copy of the app (D-127)
    meta: { keep: false },
    // the old rows stand while the next filter's are on their way; a stale request is aborted
    placeholderData: keepPreviousData,
    refetchOnReconnect: false,
    queryFn: async ({ signal }): Promise<TaskWithPeople[]> => {
      const { rows, total } = await fetchArchivePage(scope, 0, signal);
      useTotals.setState({ [name]: total });
      return foldFirstPage(rows, queryClient.getQueryData<TaskWithPeople[]>(queryKey) ?? NO_TASKS, CLOSED_PAGE, closedOrder);
    },
  });
  // a task closing arrives on the director's own socket; deletes come by `useTaskDeletes`
  useRealtimeInvalidate({ table: "tasks", filter: `author_id=eq.${userId}` }, queryKey, enabled);
  const total = useTotals((state) => state[name]);

  const more = async () => {
    const held = queryClient.getQueryData<TaskWithPeople[]>(queryKey) ?? NO_TASKS;
    setLoadingMore(true);
    try {
      const page = await fetchArchivePage(scope, held.length);
      useTotals.setState({ [name]: page.total });
      queryClient.setQueryData<TaskWithPeople[]>(queryKey, (now) => appendPage(now ?? held, page.rows));
    } finally {
      setLoadingMore(false);
    }
  };

  return {
    query,
    rows: query.data ?? NO_TASKS,
    total: query.isPlaceholderData ? null : (total ?? null),
    /** The answer for these filters is still on its way: an empty list says nothing yet. */
    busy: enabled && (text !== filter.text || (query.isFetching && (query.isPending || query.isPlaceholderData))),
    more,
    loadingMore,
  };
}

export type TaskSearch = {
  text: string;
  /** Only these people's tasks: the person in the filter, or a name among the typed words. */
  assignees?: readonly string[];
  /** Closed work only, the most recently closed first. Otherwise every status, the newest first. */
  closedOnly?: boolean;
  enabled?: boolean;
};

/**
 * Every task the person may see, by the words of the title: all the words, each anywhere. RLS is
 * the only scope (`tasks_select`): a director finds the company's tasks and nobody else's. A new
 * word aborts the request on its way; the old hits stand until the new ones land.
 */
export function useTaskSearch({ text, assignees = NO_PEOPLE, closedOnly = false, enabled = true }: TaskSearch) {
  const settled = useDebounced(text, SEARCH_PAUSE_MS);
  const words = searchWords(settled);
  const live = enabled && words.length > 0;
  const name = JSON.stringify([words, assignees, closedOnly]);

  const query = useQuery({
    queryKey: taskKeys.search(name),
    enabled: live,
    meta: { keep: false },
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }): Promise<TaskWithPeople[]> => {
      const supabase = createBrowserSupabase();
      let request = supabase.from("tasks").select(TASK_SELECT, { count: "exact" });
      if (closedOnly) request = request.in("status", [...CLOSED_STATUSES]);
      if (assignees.length > 0) request = request.in("assignee_id", [...assignees]);
      for (const word of words) request = request.ilike("title", wordPattern(word));
      const ordered = closedOnly ? request.order("closed_at", { ascending: false, nullsFirst: false }) : request.order("created_at", { ascending: false });
      const { data, count, error } = await ordered.limit(SEARCH_HITS).abortSignal(signal);
      if (error) throw new Error(error.message);
      useTotals.setState({ [name]: count ?? 0 });
      return data ?? [];
    },
  });
  const total = useTotals((state) => state[name]);
  const asked = enabled && searchWords(text).length > 0;

  return {
    query,
    rows: live ? (query.data ?? NO_TASKS) : NO_TASKS,
    /** How many there are in all; more than `rows` holds — the search stopped at SEARCH_HITS. */
    total: live && !query.isPlaceholderData ? (total ?? null) : null,
    /** The rows on screen answer an older text: the words have changed, the answer has not landed. */
    stale: query.isPlaceholderData || text !== settled,
    /** Still looking: an empty list says nothing yet. */
    searching: asked && (text !== settled || query.isFetching),
  };
}
