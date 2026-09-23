import type { Database } from "@/lib/supabase/types";

export type Role = Database["public"]["Enums"]["user_role"];

/**
 * Who counts as the team: everybody but the director and the kiosk. One list for the
 * whole client, the SQL twin is `team_role()` (D-79) — the next role costs one line
 * here instead of a hunt through hand-written `in ('employee', 'manager', …)`.
 */
export const TEAM_ROLES = ["employee", "manager", "shopkeeper", "secretary"] as const satisfies readonly Role[];

export function isTeamRole(role: Role | undefined): boolean {
  return TEAM_ROLES.includes(role as (typeof TEAM_ROLES)[number]);
}

/**
 * Who runs the instance's settings and roster: the director and the secretary (D-104).
 * `/settings` and `/people` let both in; the APIs behind them check the same list.
 */
export const ADMIN_ROLES = ["director", "secretary"] as const satisfies readonly Role[];

export function canManageTeam(role: Role | undefined): boolean {
  return ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
}

/** Which tab bar a role gets: the secretary's is the employee's plus «Настройки» (D-104). */
export type TabBarRole = "director" | "secretary" | "employee";

export function tabBarRole(role: Role | undefined): TabBarRole {
  if (role === "director") return "director";
  if (role === "secretary") return "secretary";
  return "employee";
}

/**
 * Landing route of a role. Shared by proxy.ts (edge) and the group layouts so a
 * role can never be bounced between two guards (shopkeeper has no group of its own).
 * The kiosk logs in once, on the wall, and must land on its screen — not on a profile
 * page it has no data for.
 */
export function homeForRole(role: Role | undefined): string {
  if (role === "director") return "/pulse";
  // the secretary is an ordinary employee with a second set of cards (D-79)
  if (role === "employee" || role === "manager" || role === "secretary") return "/feed";
  if (role === "tv") return "/tv";
  return "/profile";
}
