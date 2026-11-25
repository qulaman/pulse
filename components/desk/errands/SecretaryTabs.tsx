"use client";

import { History, LayoutGrid, Radio, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";

import { SegmentTabs } from "@/components/desk/ui/Toolbar";
import { useOptionalDraft } from "@/components/settings/draft";
import { DirtyDot } from "@/components/settings/SettingsTiles";

import { writeParams } from "../tasks/flow";

/*
 * «Секретарь» on the desk (D-197): one section for everything about the secretary — the requests
 * live («Заявки»), the closed ones («История»), the buttons the director asks with («Кнопки») and
 * the rest of the secretary's settings («Настройки»). `?view=` carries the tab; none — «Заявки».
 */

export type SecretaryView = "now" | "history" | "buttons" | "settings";

/** An unknown or missing `?view=` opens «Заявки». */
export function parseSecretaryView(value: string | null | undefined): SecretaryView {
  return value === "history" || value === "buttons" || value === "settings" ? value : "now";
}

/** The two tabs that edit the company's settings rather than show the requests. */
export const isSettingsView = (view: SecretaryView): view is "buttons" | "settings" => view === "buttons" || view === "settings";

/**
 * Another tab in place: the history's range stays only on «История», a request open in the panel
 * only beside the requests — the settings are no place for it.
 */
export function switchSecretaryView(next: SecretaryView) {
  writeParams(
    {
      view: next === "now" ? null : next,
      ...(next === "history" ? {} : { from: null, to: null }),
      ...(isSettingsView(next) ? { e: null } : {}),
      focus: null,
    },
    { type: "desk-switch" },
  );
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Which of the two settings tabs hold unsaved edits: «Кнопки» the buttons, «Настройки» the phone and the repeat. */
export function useSecretaryDirty(): { buttons: boolean; settings: boolean } {
  const draft = useOptionalDraft();
  if (!draft) return { buttons: false, settings: false };
  const mine = draft.draft.secretary;
  const saved = draft.server.secretary;
  return {
    buttons: !same(mine.actions, saved.actions),
    settings: mine.security_phone !== saved.security_phone || mine.escalate_after_min !== saved.escalate_after_min,
  };
}

/** The help's keys on «Кнопки» and «Настройки»: the requests' keys do nothing there. */
export const SETTINGS_SHORTCUTS = [
  { keys: ["Ctrl S"], label: "Сохранить кнопки и настройки — с любой вкладки" },
  { keys: ["Alt ↑", "Alt ↓"], label: "Кнопка выше / ниже — в её строке" },
  { keys: ["Enter"], label: "В последней надписи — новая кнопка" },
];

function Label({ icon, children, dirty = false }: { icon: ReactNode; children: ReactNode; dirty?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5" data-dirty={dirty ? "" : undefined}>
      {icon}
      {children}
      {dirty ? <DirtyDot /> : null}
    </span>
  );
}

/**
 * The section's four tabs, one row for the director and the secretary alike. `count` — what waits
 * on «Заявки» now (the director: everything live; the secretary: her queue). A tab with unsaved
 * edits carries the settings' dot.
 */
export function SecretaryTabs({ view, count }: { view: SecretaryView; count?: number }) {
  const dirty = useSecretaryDirty();
  return (
    <SegmentTabs<SecretaryView>
      aria-label="Вкладки раздела «Секретарь»"
      value={view}
      onChange={switchSecretaryView}
      items={[
        { value: "now", label: <Label icon={<Radio size={14} strokeWidth={2.25} aria-hidden />}>Заявки</Label>, count: count && count > 0 ? count : undefined },
        { value: "history", label: <Label icon={<History size={14} strokeWidth={2.25} aria-hidden />}>История</Label> },
        { value: "buttons", label: <Label icon={<LayoutGrid size={14} strokeWidth={2.25} aria-hidden />} dirty={dirty.buttons}>Кнопки</Label> },
        { value: "settings", label: <Label icon={<SlidersHorizontal size={14} strokeWidth={2.25} aria-hidden />} dirty={dirty.settings}>Настройки</Label> },
      ]}
    />
  );
}
