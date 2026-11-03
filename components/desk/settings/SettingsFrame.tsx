"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode, type RefObject } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { BrandDraftProvider, useBrandDraft } from "@/components/desk/settings/brand";
import { entryHref, searchSettings, type SettingEntry } from "@/components/desk/settings/search";
import { DeskLinks, goDesk } from "@/components/desk/ui/DeskLinks";
import { SectionLabel } from "@/components/desk/ui/SectionLabel";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField } from "@/components/desk/ui/Toolbar";
import { SettingsDraftProvider, useDirtySections } from "@/components/settings/draft";
import { BookIcon, GiftIcon, TableIcon } from "@/components/settings/icons";
import { DirtyDot, SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { parseSettingsTab, SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

const FlaskIcon = () => (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3h4M8.5 3v4.6L4.2 15a1.4 1.4 0 0 0 1.2 2.1h9.2a1.4 1.4 0 0 0 1.2-2.1L11.5 7.6V3" />
    <path d="M6.3 12h7.4" />
  </svg>
);

/**
 * A screen under «Настройки» that has a search of its own (the dictionary, the data, the points'
 * history) gives the frame its field: Ctrl+F lands there instead of the settings search.
 */
const PageSearchContext = createContext<(field: RefObject<HTMLInputElement | null> | null) => void>(() => {});

export function usePageSearch(field: RefObject<HTMLInputElement | null>) {
  const register = useContext(PageSearchContext);
  useEffect(() => {
    register(field);
    return () => register(null);
  }, [register, field]);
}

const NAV_ITEM = "[data-settings-nav]";

/** ↑/↓ on an item of the navigation: the focus walks the items, Enter opens one — the list is a menu for the keys too. */
function walkNav(event: KeyboardEvent<HTMLElement>) {
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  const items = [...event.currentTarget.querySelectorAll<HTMLElement>(NAV_ITEM)];
  const at = items.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  event.preventDefault();
  items[(at + (event.key === "ArrowDown" ? 1 : items.length - 1)) % items.length]?.focus();
}

function NavItem({
  href,
  label,
  icon,
  active,
  dirty = false,
  testId,
  keyHint,
  onClick,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  dirty?: boolean;
  testId: string;
  keyHint?: string;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      data-testid={testId}
      data-settings-nav=""
      data-dirty={dirty ? "" : undefined}
      title={keyHint ? `${label} · ${keyHint}` : label}
      // the chosen screen as the side navigation marks its section: a line of the accent at the left edge, no accent fill (D-154)
      className={`group relative flex h-9 items-center gap-2.5 rounded-[10px] px-3 text-[14px] font-medium leading-5 outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-accent/45 [&_svg]:h-[18px] [&_svg]:w-[18px] ${
        active ? "bg-surface-2/60 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"
      }`}
    >
      {active ? <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-accent" /> : null}
      <span className={`shrink-0 ${active ? "text-accent" : ""}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {dirty ? <DirtyDot /> : null}
      {keyHint && !dirty ? (
        <span aria-hidden className="nums text-[11px] font-semibold text-muted/0 transition-colors duration-[120ms] group-hover:text-muted/70">
          {keyHint}
        </span>
      ) : null}
    </Link>
  );
}

const within = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** The search's results in place of the navigation, as in macOS System Settings: a title and where it lives. */
function Results({ results, at, onPick, onHover }: { results: SettingEntry[]; at: number; onPick: (entry: SettingEntry) => void; onHover: (index: number) => void }) {
  if (results.length === 0) {
    return <p className="px-3 py-2 text-[13px] leading-[18px] text-muted">Ничего не нашлось. Попробуйте другое слово</p>;
  }
  return (
    <ul role="listbox" aria-label="Найденные настройки" className="flex flex-col gap-0.5" data-testid="settings-search-results">
      {results.map((entry, index) => (
        <li key={entry.id} role="option" aria-selected={index === at}>
          <button
            type="button"
            tabIndex={-1}
            onMouseEnter={() => onHover(index)}
            onClick={() => onPick(entry)}
            className={`flex w-full flex-col rounded-[10px] px-3 py-1.5 text-left transition-colors duration-[120ms] ${index === at ? "bg-surface-2 text-text" : "text-text/90 hover:bg-surface-2/60"}`}
          >
            <span className="text-[13px] font-medium leading-[18px]">{entry.title}</span>
            <span className="text-[12px] leading-4 text-muted">{entry.place}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * The settings' own navigation, on the left of the screen: a search over every setting, the four
 * tabs of the phone's «Настройки» (D-85) — a dot on a tab that holds unsaved edits — then the
 * screens that live next to them. «Данные» and «Очки и магазин» are the director's (D-153 §1).
 */
function SettingsNav({ searchRef }: { searchRef: RefObject<HTMLInputElement | null> }) {
  const { role } = useDeskScope();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const sections = useDirtySections();
  const brand = useBrandDraft();
  const director = role === "director";
  const [query, setQuery] = useState("");
  const [at, setAt] = useState(0);

  const dirty: Record<SettingsTab, boolean> = {
    company: brand.dirty || !!sections.window,
    app: !!(sections.secretary || sections.mascot),
    team: !!(sections.points || sections.daily_report),
    ai: !!(sections.stt || sections.parser || sections.conventions || sections.voice_retention),
  };
  const onTabs = pathname === "/desk/settings";
  const current = onTabs ? parseSettingsTab(params.get("tab") ?? undefined) : null;
  const results = query.trim() ? searchSettings(query, { director, demo: process.env.NEXT_PUBLIC_DEMO_MODE === "1" }) : null;

  const pick = (entry: SettingEntry) => {
    setQuery("");
    setAt(0);
    goDesk(router, entryHref(entry));
  };

  return (
    <nav aria-label="Разделы настроек" data-testid="settings-subnav" className="sticky top-5 w-[208px] shrink-0 self-start" onKeyDown={walkNav}>
      <div
        className="mb-4"
        onKeyDownCapture={(event) => {
          if (!results) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            setAt((index) => (index + (event.key === "ArrowDown" ? 1 : results.length - 1)) % Math.max(1, results.length));
          } else if (event.key === "Enter" && results[at]) {
            event.preventDefault();
            pick(results[at]);
          }
        }}
      >
        <SearchField
          ref={searchRef}
          value={query}
          onChange={(value) => {
            setQuery(value);
            setAt(0);
          }}
          placeholder="Найти настройку"
          aria-label="Найти настройку"
          width={208}
        />
      </div>
      {results ? (
        <Results results={results} at={at} onPick={pick} onHover={setAt} />
      ) : (
        <>
          <SectionLabel className="px-3 pb-2">Настройки</SectionLabel>
          <div className="flex flex-col gap-0.5">
            {SETTINGS_TABS.map((key, index) => (
              <NavItem
                key={key}
                href={`/desk/settings?tab=${key}`}
                label={SETTINGS_TAB_META[key].title}
                icon={SETTINGS_TAB_META[key].icon}
                active={current === key}
                dirty={dirty[key]}
                testId={`settings-nav-${key}`}
                keyHint={onTabs ? String(index + 1) : undefined}
                onClick={(event) => {
                  // on the tabs already: swap the tab in place, what is open in the others stays open
                  if (!onTabs || event.metaKey || event.ctrlKey || event.shiftKey) return;
                  event.preventDefault();
                  goDesk(router, `/desk/settings?tab=${key}`);
                }}
              />
            ))}
          </div>
          <SectionLabel className="mt-5 px-3 pb-2">Ещё</SectionLabel>
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
        </>
      )}
    </nav>
  );
}

/**
 * Ctrl/Cmd+F under «Настройки»: the screen's own search when it has one, else the settings search.
 * A second Ctrl+F from inside that field is the browser's find, as it always was.
 */
function useFindKey(settingsSearch: RefObject<HTMLInputElement | null>, pageSearch: RefObject<RefObject<HTMLInputElement | null> | null>) {
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.code !== "KeyF") return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      const own = pageSearch.current?.current ?? null;
      const field = own && own.offsetParent !== null ? own : settingsSearch.current;
      if (!field || document.activeElement === field) return;
      event.preventDefault();
      field.focus();
      field.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsSearch, pageSearch]);
}

/** Closing or reloading the window with unsaved settings asks first — the browser's own question. */
function useLeaveGuard() {
  const sections = useDirtySections();
  const brand = useBrandDraft();
  const unsaved = brand.dirty || Object.values(sections).some(Boolean);
  useEffect(() => {
    if (!unsaved) return;
    const ask = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", ask);
    return () => window.removeEventListener("beforeunload", ask);
  }, [unsaved]);
}

function FrameBody({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  useLeaveGuard();
  const settingsSearch = useRef<HTMLInputElement>(null);
  const pageSearch = useRef<RefObject<HTMLInputElement | null> | null>(null);
  // a ref, not state: registering a field must not draw the frame again
  const [register] = useState(() => (field: RefObject<HTMLInputElement | null> | null) => {
    pageSearch.current = field;
  });
  useFindKey(settingsSearch, pageSearch);
  useShortcuts("Настройки", [
    { keys: ["Ctrl F"], label: "Найти настройку (или поиск экрана)" },
    { keys: ["↑ ↓"], label: "По разделам — в навигации настроек" },
  ]);
  // «Данные» is a sheet of a table: it takes the whole width the window gives
  const wide = within(pathname, "/desk/settings/data");
  return (
    <PageSearchContext.Provider value={register}>
      <div className={`flex w-full gap-6 px-6 pb-12 pt-6 ${wide ? "" : "max-w-[1328px]"}`}>
        <SettingsNav searchRef={settingsSearch} />
        <DeskLinks className="min-w-0 flex-1">{children}</DeskLinks>
      </div>
    </PageSearchContext.Provider>
  );
}

/**
 * Every screen under «Настройки» on the desk (D-153): the settings' navigation on the left, the
 * screen on the right. The drafts of the company settings and of the company's card live here,
 * above the screens, so an unsaved edit survives a trip to the dictionary and back and the
 * navigation can show where it is.
 */
export function SettingsFrame({ children }: { children: ReactNode }) {
  return (
    <SettingsDraftProvider>
      <BrandDraftProvider>
        <FrameBody>{children}</FrameBody>
      </BrandDraftProvider>
    </SettingsDraftProvider>
  );
}
