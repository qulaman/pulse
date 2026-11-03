"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { useSetCompanyDirty } from "@/components/desk/settings/SettingsFrame";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { DemoReset } from "@/components/settings/DemoReset";
import { SettingsReady } from "@/components/settings/draft";
import {
  ConventionsSection,
  DailyReportSection,
  DictionarySection,
  MascotSection,
  ParserSection,
  PointsSection,
  SecretarySection,
  SttSection,
  WindowSection,
} from "@/components/settings/sections";
import { SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { VoiceRetentionSection } from "@/components/settings/VoiceRetentionSection";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

/** A line under a tab's sections: where the rest of it lives on the desk. */
function Elsewhere({ children }: { children: ReactNode }) {
  return <p className="px-1 text-[14px] leading-5 text-muted">{children}</p>;
}

function DeskLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="font-medium text-accent hover:underline">
      {children}
    </Link>
  );
}

/** How the company looks in the app and when its people get work; the demo reset at the very end. */
function CompanyPanel({ director }: { director: boolean }) {
  const setCompanyDirty = useSetCompanyDirty();
  return (
    <div className="flex flex-col gap-2">
      <CompanyForm onDirtyChange={setCompanyDirty} />
      <SettingsReady bones={1}>
        <WindowSection />
      </SettingsReady>
      {/* a demo instance only: the value is inlined at build time, a client's prod never sets it */}
      {director && process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
        <>
          <h2 className="eyebrow mt-6 px-1">Демо</h2>
          <DemoReset />
        </>
      ) : null}
    </div>
  );
}

/** The secretary's buttons and the mascot — the modules themselves are the side navigation's. */
function AppPanel() {
  return (
    <div className="flex flex-col gap-2">
      <SettingsReady bones={2}>
        <SecretarySection />
        <MascotSection />
      </SettingsReady>
    </div>
  );
}

/** The points' rules and the daily report (the director's policy, D-152); the people are «Команда». */
function TeamPanel({ director }: { director: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <SettingsReady bones={director ? 2 : 1}>
        <PointsSection />
        {director ? <DailyReportSection /> : null}
      </SettingsReady>
      <div className="mt-3 flex flex-col gap-1">
        <Elsewhere>
          Люди, роли и пароли — в разделе <DeskLink href="/desk/team">«Команда»</DeskLink>
        </Elsewhere>
        {director ? (
          <Elsewhere>
            Балансы, споры, история и магазин — <DeskLink href="/desk/settings/points">«Очки и магазин»</DeskLink>
          </Elsewhere>
        ) : null}
      </div>
    </div>
  );
}

/** How a voice becomes work: hearing it, reading it, the company's words and deadlines. */
function AiPanel() {
  return (
    <SettingsReady bones={4}>
      <div className="flex flex-col gap-2">
        <SttSection />
        <ParserSection />
        <DictionarySection />
        <ConventionsSection />
        {/* how long recordings and transcripts are kept (D-155, tasks/027) — as on the phone's tab */}
        <VoiceRetentionSection />
      </div>
    </SettingsReady>
  );
}

/**
 * The four tabs of «Настройки» (D-85) on the desk: the phone's own sections in the phone's order,
 * in one column. The tab comes from the address; a tab is mounted on its first visit and then
 * only hidden, so an open section and a half-typed name survive a trip to another tab. A
 * section's «Сохранить» stands under its fields, in the flow. The secretary gets the same four
 * tabs without the director's own modules (D-104).
 */
export function SettingsPanels({ tab }: { tab: SettingsTab }) {
  const { role } = useDeskScope();
  const director = role === "director";
  const setCompanyDirty = useSetCompanyDirty();
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([tab]));
  if (!visited.has(tab)) setVisited(new Set(visited).add(tab));

  // a new tab starts from its top, as a new screen would
  useEffect(() => {
    document.getElementById("desk-main")?.scrollTo({ top: 0 });
  }, [tab]);
  // the company form goes with the screen: its edits are not «unsaved» anywhere any more
  useEffect(() => () => setCompanyDirty(false), [setCompanyDirty]);

  const meta = SETTINGS_TAB_META[tab];
  return (
    <div className="flex w-full max-w-[760px] flex-col gap-4">
      <PageTitle title={meta.title} state={{ text: meta.about }} />
      {SETTINGS_TABS.map((key) =>
        visited.has(key) ? (
          <section
            key={key}
            id={`desk-settings-panel-${key}`}
            data-testid={`desk-settings-panel-${key}`}
            aria-label={SETTINGS_TAB_META[key].title}
            hidden={key !== tab}
          >
            {key === "company" ? (
              <CompanyPanel director={director} />
            ) : key === "app" ? (
              <AppPanel />
            ) : key === "team" ? (
              <TeamPanel director={director} />
            ) : (
              <AiPanel />
            )}
          </section>
        ) : null,
      )}
    </div>
  );
}
