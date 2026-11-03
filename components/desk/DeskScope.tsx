"use client";

import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import type { DeskRole } from "@/lib/desk/routes";
import { setCompanyNames } from "@/lib/people/names";
import { useRoster } from "@/lib/people/roster";
import { taskKeys, type Me } from "@/lib/tasks/queries";

type Scope = { role: DeskRole; pointsEnabled: boolean };

const ScopeContext = createContext<Scope | null>(null);

/**
 * What every desk screen knows from the layout's server read, the way `RoleScope` does it for the
 * phone (its tab-bar context is not needed here): `me` goes into the query cache before any screen
 * renders, so `useMe()` has it at once; the company's names tell namesakes apart (D-146).
 */
export function DeskScope({ me, role, pointsEnabled, children }: { me: Me; role: DeskRole; pointsEnabled: boolean; children: ReactNode }) {
  const queryClient = useQueryClient();
  useState(() => {
    if (queryClient.getQueryData(taskKeys.me()) === undefined) queryClient.setQueryData(taskKeys.me(), me);
    return null;
  });
  return (
    <ScopeContext.Provider value={{ role, pointsEnabled }}>
      <NamesSync />
      {children}
    </ScopeContext.Provider>
  );
}

function NamesSync() {
  const roster = useRoster();
  useEffect(() => {
    if (roster.data) setCompanyNames(roster.data.map((person) => person.full_name));
  }, [roster.data]);
  return null;
}

/** The desk's role and the points switch, as the layout read them; throws outside the desk. */
export function useDeskScope(): Scope {
  const scope = useContext(ScopeContext);
  if (!scope) throw new Error("useDeskScope outside the desk");
  return scope;
}
