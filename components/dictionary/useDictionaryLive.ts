"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";

import type { RosterPerson } from "@/lib/dictionary";
import { misheardQueryKey, wordStatsKey } from "@/lib/dictionary-queries";
import { peopleKeys, type Person } from "@/lib/people/queries";
import { useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import { settingsKey } from "@/lib/settings-query";

/**
 * The dictionary kept fresh, the phone's and the desk's alike. The director and the secretary may
 * have it open at once: a name one of them adds shows up on the other's screen. While an own edit
 * is in flight its settle reads the list anyway — a refetch in between would briefly show it
 * undone. Words live in company.settings, which Realtime does not carry: they are read again when
 * the screen comes back to the front — the other editor's words land by then.
 */
export function useDictionaryLive(companyId: string | undefined, channel: string) {
  const queryClient = useQueryClient();
  useRealtimeListener(
    { table: "profiles", filter: companyId ? `company_id=eq.${companyId}` : undefined },
    () => {
      if (queryClient.isMutating({ mutationKey: ["dictionary", "aliases"] }) === 0) void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
    () => void queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
    channel,
    Boolean(companyId),
  );
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({ queryKey: settingsKey });
      void queryClient.invalidateQueries({ queryKey: misheardQueryKey });
      void queryClient.invalidateQueries({ queryKey: wordStatsKey });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);
}

/**
 * Who the speech pipeline can hear: the active people — the kiosk is a login, not a person, and
 * the gone are gone (lib/roster.ts) — and the same as the roster the dictionary checks names on.
 */
export function useHeard(people: readonly Person[] | undefined): { heard: Person[]; roster: RosterPerson[] } {
  return useMemo(() => {
    const heard = (people ?? []).filter((p) => p.is_active && p.role !== "tv");
    return { heard, roster: heard.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })) };
  }, [people]);
}
