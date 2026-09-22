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
