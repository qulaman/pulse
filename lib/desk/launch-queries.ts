"use client";

import { useQuery, type QueryClient } from "@tanstack/react-query";

import { visibleEmail } from "@/lib/people/email";
import type { LoginCodeStatus, PersonLogin } from "@/lib/people/queries";
import type { Health } from "@/lib/push/health";
import { createBrowserSupabase } from "@/lib/supabase/client";

import { hasLogin, nextInTurn, type CompanyHistory, type LoginFact } from "./launch";

/**
 * What the launch reads. No migration and no walk over `auth.users`: a company's history comes
 * from two counts under the director's RLS, a person's way in from the two routes their card
 * already calls (`/api/people/[id]/login`, `/login-code`), one person at a time. A team-wide
 * status would want an RPC (D-153 §14), so these asks stop as soon as they have the answer.
 */

/** How far «Сегодня» looks for a login: a checklist is no reason to ask about two hundred people on every open. */
export const LOGIN_PROBE = 12;
/** A status read a moment ago stands: walking past a card just opened costs nothing. */
const FRESH_MS = 30_000;

/** How much the company has done; `count` is null only on a failure, and an unknown is never a zero. */
export function useCompanyHistory(companyId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["desk", "launch", "history", companyId],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CompanyHistory> => {
      const supabase = createBrowserSupabase();
      const [tasks, announcements] = await Promise.all([
        supabase.from("tasks").select("id", { count: "exact", head: true }).eq("company_id", companyId).neq("status", "scheduled"),
        supabase.from("announcements").select("id", { count: "exact", head: true }).eq("company_id", companyId),
      ]);
      if (tasks.error) throw new Error(tasks.error.message);
      if (announcements.error) throw new Error(announcements.error.message);
      if (tasks.count === null || announcements.count === null) throw new Error("no count");
      return { sentTasks: tasks.count, announcements: announcements.count };
    },
  });
}

async function read<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}

/** A person's way in, under the card's own query keys: the card and this walk share what they have read. */
export async function readLoginFact(client: QueryClient, id: string): Promise<LoginFact> {
  const [login, code] = await Promise.all([
    client.fetchQuery({ queryKey: ["people", id, "login"], staleTime: FRESH_MS, queryFn: () => read<PersonLogin>(`/api/people/${id}/login`) }),
    client.fetchQuery({ queryKey: ["people", id, "login-code"], staleTime: FRESH_MS, queryFn: () => read<LoginCodeStatus>(`/api/people/${id}/login-code`) }),
  ]);
  return { signedInAt: login.last_sign_in_at, email: visibleEmail(login.email), code: code.state };
}

/** A device of the person's own means somebody signed in on it: the channel's read is free, Today has it anyway. */
function hasDevice(health: ReadonlyMap<string, Health> | undefined, id: string): boolean {
  const channel = health?.get(id);
  return channel !== undefined && channel.state !== "off";
}

/** Whether anyone of the team has a way in, and who is the first without one. Stops once both are known. */
export async function scanLogins(client: QueryClient, team: readonly { id: string }[], health: ReadonlyMap<string, Health> | undefined): Promise<{ anyLogin: boolean; nextPersonId: string | null }> {
  let anyLogin = team.some((person) => hasDevice(health, person.id));
  let nextPersonId: string | null = null;
  for (const person of team.filter((one) => !hasDevice(health, one.id)).slice(0, LOGIN_PROBE)) {
    if (anyLogin && nextPersonId) break;
    const fact = await readLoginFact(client, person.id).catch(() => null);
    if (!fact) continue;
    if (hasLogin(fact)) anyLogin = true;
    else nextPersonId ??= person.id;
  }
  return { anyLogin, nextPersonId };
}

/**
 * The next person of the team without a way in, from the card the walk stands on. Asked on a
 * press, never on a render: everybody having entered is the costly answer. `unknown` — how many
 * could not be read: «у всех есть вход» would be a guess then.
 */
export async function findWithoutLogin(
  client: QueryClient,
  team: readonly { id: string }[],
  currentId: string,
  health: ReadonlyMap<string, Health> | undefined,
): Promise<{ id: string | null; unknown: number }> {
  let unknown = 0;
  for (const person of nextInTurn(team, currentId)) {
    if (hasDevice(health, person.id)) continue;
    const fact = await readLoginFact(client, person.id).catch(() => null);
    if (!fact) unknown += 1;
    else if (!hasLogin(fact)) return { id: person.id, unknown };
  }
  return { id: null, unknown };
}
