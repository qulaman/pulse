"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SettingsSectionsBone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { CompanySettings, SettingsPatch } from "@/lib/settings";
import { fetchSettings, settingsKey } from "@/lib/settings-query";

async function patchSettings(patch: SettingsPatch): Promise<CompanySettings> {
  const res = await fetch("/api/settings", {
    method: "PATCH",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error("save failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export type SectionKey =
  | "stt"
  | "parser"
  | "conventions"
  | "points"
  | "window"
  | "secretary"
  | "mascot"
  | "daily_report"
  | "voice_retention";

/** The keys of the daily report the screen edits; `started_on` and `checked_on` are the server's (D-152). */
function reportKeys(section: CompanySettings["daily_report"]) {
  return {
    enabled: section.enabled,
    workdays: section.workdays,
    holidays: section.holidays,
    work_start: section.work_start,
    remind_at: section.remind_at,
    ask_from: section.ask_from,
  };
}

type Draft = {
  server: CompanySettings;
  draft: CompanySettings;
  update: (patch: Partial<CompanySettings>) => void;
  /** The conventions as they will be saved: one row per fixed key (task 026). */
  conventions: CompanySettings["conventions"];
  dirty: Record<SectionKey, boolean>;
  save: (patch: SettingsPatch) => void;
  /** Which section is in flight: the spinner belongs to the button that was pressed. */
  saving: (key: keyof SettingsPatch) => boolean;
};

const DraftContext = createContext<Draft | null>(null);

/**
 * The company settings being edited, held above the tabs: a section's unsaved edits live
 * here, not in the section, so switching to another tab and back loses nothing and a tile
 * can show which tab still holds edits. Until the first edit the draft mirrors the server.
 */
export function SettingsDraftProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: settingsKey, queryFn: fetchSettings });
  const [edited, setEdited] = useState<CompanySettings | null>(null);

  const save = useMutation({
    mutationFn: patchSettings,
    // Only the cache is rebased: a section saved on its own stops being dirty, and edits
    // left open in other sections survive.
    onSuccess: (settings, patch) => {
      queryClient.setQueryData(settingsKey, settings);
      // the rating, the team list and the award buttons read the switch on their own
      if (patch.points_enabled !== undefined) void queryClient.invalidateQueries({ queryKey: ["company", "points_enabled"] });
      // the home faces read the holiday switch on their own (D-119)
      if (patch.mascot_seasons !== undefined) void queryClient.invalidateQueries({ queryKey: ["company", "mascot_seasons"] });
      // the reaction prices and the employee face's worry switch (D-133)
      if (patch.points_rules !== undefined) void queryClient.invalidateQueries({ queryKey: ["company", "points_rules"] });
      if (patch.mascot_telegraph !== undefined) void queryClient.invalidateQueries({ queryKey: ["company", "mascot_telegraph"] });
      // the secretary's buttons and their scenes are read by Пульс and the secretary's screen (D-97)
      if (patch.secretary !== undefined) void queryClient.invalidateQueries({ queryKey: ["company"] });
      // the report screens read the module's switch, days and points through their RPCs (D-152)
      if (patch.daily_report !== undefined || patch.points_rules !== undefined) void queryClient.invalidateQueries({ queryKey: ["daily-report"] });
      toast("Сохранил настройки");
    },
    onError: () => toast("Не получилось сохранить. Попробуй ещё раз"),
  });

  const server = query.data ?? null;
  const draft = edited ?? server;

  let value: Draft | null = null;
  if (draft && server) {
    const conventions = draft.conventions;
    value = {
      server,
      draft,
      update: (patch) => setEdited({ ...draft, ...patch }),
      conventions,
      dirty: {
        stt: !same(draft.stt, server.stt),
        parser: !same(draft.parser, server.parser),
        conventions: !same(conventions, server.conventions),
        points:
          draft.points_enabled !== server.points_enabled ||
          draft.rating_mode !== server.rating_mode ||
          !same(draft.points_rules, server.points_rules) ||
          !same(draft.ether_events, server.ether_events),
        window: !same(draft.delivery_window, server.delivery_window),
        secretary: !same(draft.secretary, server.secretary),
        mascot: draft.mascot_seasons !== server.mascot_seasons || draft.mascot_telegraph !== server.mascot_telegraph,
        daily_report: !same(reportKeys(draft.daily_report), reportKeys(server.daily_report)),
        voice_retention: !same(draft.voice_retention, server.voice_retention),
      },
      save: (patch) => save.mutate(patch),
      saving: (key) => save.isPending && save.variables?.[key] !== undefined,
    };
  }

  return <DraftContext.Provider value={value}>{children}</DraftContext.Provider>;
}

/** Sections render only inside `SettingsReady`, so the draft is always there for them. */
export function useDraft(): Draft {
  const draft = useContext(DraftContext);
  if (!draft) throw new Error("useDraft outside SettingsReady");
  return draft;
}

/** Which sections hold unsaved edits; nothing is dirty before the settings arrive. */
export function useDirtySections(): Partial<Record<SectionKey, boolean>> {
  return useContext(DraftContext)?.dirty ?? {};
}

/** The sections of one tab, or as many closed-section bones while the settings load. */
export function SettingsReady({ bones, children }: { bones: number; children: ReactNode }) {
  const draft = useContext(DraftContext);
  if (!draft) return <SettingsSectionsBone count={bones} />;
  return <>{children}</>;
}
