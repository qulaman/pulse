import type { Database } from "@/lib/supabase/types";

export type Role = Database["public"]["Enums"]["user_role"];

/**
 * Landing route of a role. Shared by proxy.ts (edge) and the group layouts so a
 * role can never be bounced between two guards (shopkeeper has no group of its own).
 * The kiosk logs in once, on the wall, and must land on its screen — not on a profile
 * page it has no data for.
 */
export function homeForRole(role: Role | undefined): string {
  if (role === "director") return "/pulse";
  if (role === "employee" || role === "manager") return "/feed";
  if (role === "tv") return "/tv";
  return "/profile";
}
