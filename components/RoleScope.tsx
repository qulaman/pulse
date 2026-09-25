"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";

import type { TabBarRole } from "@/lib/routes";
import { taskKeys, type Me } from "@/lib/tasks/queries";

const RoleContext = createContext<TabBarRole | null>(null);

/**
 * The tab bar's role for the screens under a layout, known on the server: the screen head
 * decides «a tab's root or a nested screen» — and so its layout (D-113 §7, D-117) — on the
 * first paint, not after the profile has loaded (that would move the page by a row).
 *
 * `me` — the profile the layout has just read: it goes into the query cache before any
 * screen below renders, so `useMe()` has it at once and the board's queries start without
 * waiting for /api/me (D-126). Seeded while rendering, on the server and on the client
 * alike, so both render the same first frame; a value already cached stays.
 */
export function RoleScope({ role, me, children }: { role: TabBarRole; me?: Me; children: ReactNode }) {
  const queryClient = useQueryClient();
  useState(() => {
    if (me && queryClient.getQueryData(taskKeys.me()) === undefined) queryClient.setQueryData(taskKeys.me(), me);
    return null;
  });
  return <RoleContext.Provider value={role}>{children}</RoleContext.Provider>;
}

export function useTabRole(): TabBarRole | null {
  return useContext(RoleContext);
}
