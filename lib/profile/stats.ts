"use client";

import { useQuery } from "@tanstack/react-query";

import { aqtobeDay } from "@/lib/ai/time";
import type { Availability, Role } from "@/lib/people/queries";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database } from "@/lib/supabase/types";
import { WORKING } from "@/lib/tasks/lifecycle";

type TaskStatus = Database["public"]["Enums"]["task_status"];

/** Fourteen day-buckets, oldest first — the strip inside the identity card. */
export const STRIP_DAYS = 14;

/** What the phone's identity card says about a person (/profile): their month in numbers. */
export type ProfileStats = {
  done30: number;
  onTimePct: number | null;
  open: number;
  position: string | null;
  availability: Availability;
  since: string | null;
  strip: number[];
  people?: number;
  sent30?: number;
};

/** Work not finished: in somebody's hands, or waiting for the director's acceptance. */
const OPEN: readonly TaskStatus[] = [...WORKING, "pending_review"];

/** Counts instants into the last fourteen Aqtobe days, oldest bucket first. */
export function stripOf(dates: (string | null)[], now = Date.now()): number[] {
  const today = aqtobeDay(new Date(now));
  const buckets = new Array<number>(STRIP_DAYS).fill(0);
  for (const iso of dates) {
    if (!iso) continue;
    const index = STRIP_DAYS - 1 - (today - aqtobeDay(new Date(iso)));
    if (index >= 0 && index < STRIP_DAYS) buckets[index] += 1;
  }
  return buckets;
}

async function readCard(userId: string) {
  const { data } = await createBrowserSupabase().from("profiles").select("position, availability, created_at").eq("id", userId).single();
  return { position: data?.position ?? null, availability: data?.availability ?? ("active" as Availability), since: data?.created_at ?? null };
}

/** The director's month: the team's size, the tasks he gave, the work still open in the company. */
async function readDirector(since: string) {
  const supabase = createBrowserSupabase();
  const [people, sent, open] = await Promise.all([
    supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_active", true).not("role", "in", "(tv,director)"),
    supabase.from("tasks").select("created_at").gte("created_at", since),
    supabase.from("tasks").select("id", { count: "exact", head: true }).in("status", OPEN),
  ]);
  const created = sent.data ?? [];
  return { done30: 0, onTimePct: null, open: open.count ?? 0, strip: stripOf(created.map((task) => task.created_at)), people: people.count ?? 0, sent30: created.length };
}

/**
 * «В срок» is the moment of the hand-in, not of the director's acceptance (D-189), as the rating and
 * the wall count it; a task closed without a hand-in is judged by its closing; no deadline — on time.
 */
export function handedInOnTime(task: { deadline: string | null; completed_at: string | null; closed_at: string | null }): boolean {
  if (!task.deadline) return true;
  const at = task.completed_at ?? task.closed_at;
  return at !== null && Date.parse(at) <= Date.parse(task.deadline);
}

/** A person's month: what they handed in and how much of it by the deadline, what is still open. */
async function readPerson(userId: string, since: string) {
  const supabase = createBrowserSupabase();
  const [done, open] = await Promise.all([
    supabase.from("tasks").select("deadline, completed_at, closed_at").eq("assignee_id", userId).eq("status", "done").gte("closed_at", since),
    supabase.from("tasks").select("id", { count: "exact", head: true }).eq("assignee_id", userId).in("status", OPEN),
  ]);
  const rows = done.data ?? [];
  const onTime = rows.filter(handedInOnTime).length;
  return { done30: rows.length, onTimePct: rows.length ? Math.round((100 * onTime) / rows.length) : null, open: open.count ?? 0, strip: stripOf(rows.map((task) => task.closed_at)) };
}

/** The numbers of the identity card, under the person's own RLS: the last 30 days. */
export function useProfileStats(userId: string | undefined, role: Role) {
  return useQuery({
    enabled: Boolean(userId),
    queryKey: ["profile-stats", userId],
    queryFn: async (): Promise<ProfileStats> => {
      const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
      const card = await readCard(userId!);
      return { ...card, ...(role === "director" ? await readDirector(since) : await readPerson(userId!, since)) };
    },
  });
}
