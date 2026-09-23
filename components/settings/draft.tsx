"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { SettingsSectionsBone } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import type { CompanySettings, SettingsPatch } from "@/lib/settings";

async function fetchSettings(): Promise<CompanySettings> {
  const res = await fetch("/api/settings", { credentials: "include" });
  if (!res.ok) throw new Error("settings failed");
  return ((await res.json()) as { settings: CompanySettings }).settings;
}

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

function splitVocabulary(text: string): string[] {
  return text
    .split(/[,\n;]/)
    .map((word) => word.trim())
    .filter(Boolean);
}

export type SectionKey = "stt" | "parser" | "vocabulary" | "conventions" | "points" | "window" | "secretary";

type Draft = {
  server: CompanySettings;
  draft: CompanySettings;
  update: (patch: Partial<CompanySettings>) => void;
  vocabularyText: string;
  setVocabularyText: (text: string | null) => void;
  /** The words as they will be saved: split, trimmed, no empties. */
  vocabulary: string[];
  /** The conventions as they will be saved: empty rows are scratch space. */
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
  const query = useQuery({ queryKey: ["settings"], queryFn: fetchSettings });
  const [edited, setEdited] = useState<CompanySettings | null>(null);
  const [vocabularyEdited, setVocabularyEdited] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: patchSettings,
    // Only the cache is rebased: a section saved on its own stops being dirty, and edits
    // left open in other sections survive.
    onSuccess: (settings, patch) => {
      queryClient.setQueryData(["settings"], settings);
      // the rating, the team list and the award buttons read the switch on their own
      if (patch.points_enabled !== undefined) void queryClient.invalidateQueries({ queryKey: ["company", "points_enabled"] });
      // the secretary's buttons and their scenes are read by Пульс and the secretary's screen (D-97)
      if (patch.secretary !== undefined) void queryClient.invalidateQueries({ queryKey: ["company"] });
      toast("Сохранил настройки");
    },
    onError: () => toast("Не получилось сохранить. Попробуй ещё раз"),
  });

  const server = query.data ?? null;
  const draft = edited ?? server;

  let value: Draft | null = null;
  if (draft && server) {
    const vocabularyText = vocabularyEdited ?? draft.vocabulary.join(", ");
    const vocabulary = splitVocabulary(vocabularyText);
    const conventions = draft.conventions.filter((row) => row.phrase.trim() && row.meaning.trim());
    value = {
      server,
      draft,
      update: (patch) => setEdited({ ...draft, ...patch }),
      vocabularyText,
      setVocabularyText: setVocabularyEdited,
      vocabulary,
      conventions,
      dirty: {
        stt: !same(draft.stt, server.stt),
        parser: !same(draft.parser, server.parser),
        vocabulary: !same(vocabulary, server.vocabulary),
        conventions: !same(conventions, server.conventions),
        points: draft.points_enabled !== server.points_enabled || draft.rating_mode !== server.rating_mode,
        window: !same(draft.delivery_window, server.delivery_window),
        secretary: !same(draft.secretary, server.secretary),
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
