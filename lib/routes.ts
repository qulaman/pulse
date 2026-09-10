import type { Database } from "@/lib/supabase/types";

export type Role = Database["public"]["Enums"]["user_role"];

/**
 * Landing route of a role. Shared by proxy.ts (edge) and the group layouts so a
 * role can never be bounced between two guards (tv / shopkeeper have no group).
 */
export function homeForRole(role: Role | undefined): string {
  if (role === "director") return "/pulse";
  if (role === "employee" || role === "manager") return "/feed";
  return "/profile";
}
