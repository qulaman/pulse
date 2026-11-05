import "server-only";

import { AuthError, getSessionProfile, type SessionProfile } from "@/lib/auth";
import { loadBrand } from "@/lib/brand";
import { deskDevToolsOpen } from "@/lib/desk/routes";
import { canManageTeam, isTeamRole, tabBarRole, type TabBarRole } from "@/lib/routes";

/**
 * May this person into the lab: the director and the secretary (D-63) of a company with the
 * developers' tools (`settings.dev_tools`, closed to a client); the whole team while the company
 * tests the product — `settings.lab_for_all` (D-150). The kiosk never. The lab's API stays the
 * director's and the secretary's either way.
 */
export async function labOpen(profile: SessionProfile): Promise<boolean> {
  const admin = canManageTeam(profile.role);
  if (!admin && !isTeamRole(profile.role)) return false;
  const brand = await loadBrand(profile.companyId);
  return brand.labForAll || (admin && brand.devTools);
}

/**
 * The desk's «Лаборатория» and «Данные» for whoever is signed in. Nobody signed in: closed — the
 * desk's own layout sends them to the login. Read on the server, so the settings' navigation
 * draws its first frame right and a direct address never shows a screen it should not.
 */
export async function deskDevTools(): Promise<boolean> {
  try {
    const profile = await getSessionProfile();
    return deskDevToolsOpen(profile.role, (await loadBrand(profile.companyId)).devTools);
  } catch (error) {
    if (error instanceof AuthError) return false;
    throw error;
  }
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
