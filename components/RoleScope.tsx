"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { TabBarRole } from "@/lib/routes";

const RoleContext = createContext<TabBarRole | null>(null);

/**
 * The tab bar's role for the screens under a layout, known on the server: the screen head
 * decides «a tab's root or a nested screen» — and so its layout (D-113 §7, D-117) — on the
 * first paint, not after the profile has loaded (that would move the page by a row).
 */
export function RoleScope({ role, children }: { role: TabBarRole; children: ReactNode }) {
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useTabRole(): TabBarRole | null {
  return useContext(RoleContext);
}
