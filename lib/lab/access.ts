import "server-only";

import type { SessionProfile } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { canManageTeam, isTeamRole, tabBarRole, type TabBarRole } from "@/lib/routes";

/**
 * May this person into the lab: the director and the secretary always (D-63), the rest of
 * the team while the company tests the product — `settings.lab_for_all` (D-150). The kiosk
 * never. The lab's API stays the director's and the secretary's either way.
 */
export async function labOpen(profile: SessionProfile): Promise<boolean> {
  if (canManageTeam(profile.role)) return true;
  if (!isTeamRole(profile.role)) return false;
  return (await loadBrand(profile.companyId)).labForAll;
}

/**
 * The tab bar a layout draws, decided on the server so the first paint already has every tab
 * (D-113 §7): the role's bar and, while the company tests, «Лаб» on the team's bar (D-150).
 * `lab` only adds a tab to the team's bar — the director's and the secretary's carry it anyway.
 */
export async function tabScope(profile: SessionProfile): Promise<{ role: TabBarRole; lab: boolean }> {
  const role = tabBarRole(profile.role);
  return { role, lab: role === "employee" && (await labOpen(profile)) };
}
