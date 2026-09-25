"use client";

import { motion } from "framer-motion";
import type { ReactNode, Ref } from "react";

import { AppsIcon, BuildingIcon, PeopleIcon, SparkIcon } from "@/components/settings/icons";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

export const SETTINGS_TAB_META: Record<SettingsTab, { title: string; short: string; about: string; icon: ReactNode }> = {
  company: { title: "Компания", short: "Компания", about: "название, логотип, часы", icon: <BuildingIcon /> },
  app: { title: "Программа", short: "Программа", about: "модули и секретарь", icon: <AppsIcon /> },
  team: { title: "Сотрудники", short: "Сотрудники", about: "люди, роли, очки", icon: <PeopleIcon /> },
  ai: { title: "ИИ-модель", short: "ИИ", about: "речь, разбор, словарь", icon: <SparkIcon /> },
};

export const SETTINGS_THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

export function DirtyDot() {
  return <span aria-label="есть несохранённое" className="block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />;
}

/**
 * The four tiles of «Настройки» (D-85) — the tabs. One component for the page and for its
 * skeleton (D-122): the tiles are the screen's chrome, so they stand in the skeleton exactly
 * as they will stand, and without `onSelect` they are only a picture of themselves.
 */
export function SettingsTiles({
  tab,
  dirty,
  onSelect,
  tilesRef,
}: {
  tab: SettingsTab;
  dirty?: Partial<Record<SettingsTab, boolean>>;
  onSelect?: (tab: SettingsTab) => void;
  tilesRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div ref={tilesRef} role="tablist" aria-label="Разделы настроек" className="mt-5 grid grid-cols-2 gap-2">
      {SETTINGS_TABS.map((key) => {
        const meta = SETTINGS_TAB_META[key];
        const active = key === tab;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            id={onSelect ? `settings-tab-${key}` : undefined}
            aria-controls={onSelect ? `settings-panel-${key}` : undefined}
            aria-selected={active}
            data-testid={onSelect ? `settings-tab-${key}` : undefined}
            disabled={!onSelect}
            onClick={() => onSelect?.(key)}
            className="settings-tile relative flex min-h-[104px] flex-col rounded-[16px] p-3 text-left transition-transform duration-[120ms] active:scale-[0.98]"
          >
            {active ? <motion.span layoutId="settings-tile" transition={SETTINGS_THUMB} className="settings-tile-on absolute -inset-px rounded-[16px]" /> : null}
            <span className="relative z-[1] flex items-start justify-between">
              <span
                aria-hidden
                className="flex h-9 w-9 items-center justify-center rounded-[11px] transition-colors duration-[160ms]"
                style={
                  active
                    ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--accent)" }
                    : { background: "var(--surface-2)", color: "var(--text-muted)" }
                }
              >
                {meta.icon}
              </span>
              {dirty?.[key] ? (
                <span className="mr-0.5 mt-0.5">
                  <DirtyDot />
                </span>
              ) : null}
            </span>
            <span className="relative z-[1] mt-3 block min-w-0">
              <span className="block font-display text-[16px] font-semibold leading-5 tracking-[-0.01em]">{meta.title}</span>
              <span className="mt-0.5 line-clamp-2 text-[12px] leading-4 text-muted">{meta.about}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
