"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useState, type MouseEvent, type ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { DeskLinks, goDesk } from "@/components/desk/ui/DeskLinks";
import { SettingsDraftProvider, useDirtySections } from "@/components/settings/draft";
import { BookIcon, GiftIcon, TableIcon } from "@/components/settings/icons";
import { DirtyDot, SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { parseSettingsTab, SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

/** «Компания»'s form keeps its edits to itself; it reports whether it has any, for the dot. */
const CompanyDirtyContext = createContext<(dirty: boolean) => void>(() => {});

export function useSetCompanyDirty(): (dirty: boolean) => void {
  return useContext(CompanyDirtyContext);
}

const FlaskIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3h4M8.5 3v4.6L4.2 15a1.4 1.4 0 0 0 1.2 2.1h9.2a1.4 1.4 0 0 0 1.2-2.1L11.5 7.6V3" />
    <path d="M6.3 12h7.4" />
  </svg>
);

function NavItem({
  href,
  label,
  icon,
  active,
  dirty = false,
  testId,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  dirty?: boolean;
  testId: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      data-dirty={dirty ? "" : undefined}
      className={`flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium leading-5 transition-colors duration-[120ms] [&_svg]:h-[18px] [&_svg]:w-[18px] ${
        active ? "bg-accent/12 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <span className={`shrink-0 ${active ? "text-accent" : ""}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dirty ? <DirtyDot /> : null}
    </Link>
  );
}

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/**
 * The settings' own navigation, on the left of the screen: the four tabs of the phone's
 * «Настройки» (D-85) — a dot on a tab that holds unsaved edits — then the screens that live
 * next to them. «Данные» and «Очки и магазин» are the director's (D-153 §1).
 */
function SettingsNav({ companyDirty }: { companyDirty: boolean }) {
  const { role } = useDeskScope();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const sections = useDirtySections();
  const director = role === "director";

  const dirty: Record<SettingsTab, boolean> = {
    company: companyDirty || !!sections.window,
    app: !!(sections.secretary || sections.mascot),
    team: !!(sections.points || sections.daily_report),
    ai: !!(sections.stt || sections.parser || sections.conventions),
  };
  const onTabs = pathname === "/desk/settings";
  const current = onTabs ? parseSettingsTab(params.get("tab") ?? undefined) : null;

  return (
    <nav aria-label="Разделы настроек" data-testid="settings-subnav" className="sticky top-5 w-[208px] shrink-0 self-start">
      <p className="eyebrow px-2.5 pb-2">Настройки</p>
      <div className="flex flex-col gap-0.5">
        {SETTINGS_TABS.map((key) => (
          <NavItem
            key={key}
            href={`/desk/settings?tab=${key}`}
            label={SETTINGS_TAB_META[key].title}
            icon={SETTINGS_TAB_META[key].icon}
            active={current === key}
            dirty={dirty[key]}
            testId={`settings-nav-${key}`}
            onClick={(event) => {
              // on the tabs already: swap the tab in place, what is open in the others stays open
              if (!onTabs || event.metaKey || event.ctrlKey || event.shiftKey) return;
              event.preventDefault();
              goDesk(router, `/desk/settings?tab=${key}`);
            }}
          />
        ))}
      </div>
      <div className="my-3 border-t border-border" />
      <div className="flex flex-col gap-0.5">
        <NavItem
          href="/desk/settings/dictionary"
          label="Словарь"
          icon={<BookIcon />}
          active={within(pathname, "/desk/settings/dictionary")}
          testId="settings-nav-dictionary"
        />
        <NavItem href="/desk/settings/lab" label="Лаборатория" icon={<FlaskIcon />} active={within(pathname, "/desk/settings/lab")} testId="settings-nav-lab" />
        {director ? (
          <NavItem href="/desk/settings/data" label="Данные" icon={<TableIcon />} active={within(pathname, "/desk/settings/data")} testId="settings-nav-data" />
        ) : null}
        {director ? (
          <NavItem
            href="/desk/settings/points"
            label="Очки и магазин"
            icon={<GiftIcon />}
            active={within(pathname, "/desk/settings/points")}
            testId="settings-nav-points"
          />
        ) : null}
      </div>
    </nav>
  );
}

/**
 * Every screen under «Настройки» on the desk (D-153): the settings' navigation on the left, the
 * screen on the right. The draft of the company settings lives here, above the screens, so an
 * unsaved edit survives a trip to the dictionary and back and the navigation can show where it is.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  const [companyDirty, setCompanyDirty] = useState(false);
  return (
    <SettingsDraftProvider>
      <CompanyDirtyContext.Provider value={setCompanyDirty}>
        <div className="flex w-full gap-6 px-6 pb-10 pt-5">
          <SettingsNav companyDirty={companyDirty} />
          <DeskLinks className="min-w-0 flex-1">{children}</DeskLinks>
        </div>
      </CompanyDirtyContext.Provider>
    </SettingsDraftProvider>
  );
}
