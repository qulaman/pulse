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
import { DirtyDot, SETTINGS_TAB_META } from "@/components/settings/SettingsTiles";
import { parseSettingsTab, SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";

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

/**
 * «Лаборатория» and «Данные» open for this person (lib/desk/routes.ts `deskDevToolsOpen`), as the
 * layout decided on the server: the navigation, the settings search and the links to them ask here.
 */
const DevToolsContext = createContext(false);

export function useDevTools(): boolean {
  return useContext(DevToolsContext);
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
  active,
  dirty = false,
  testId,
  keyHint,
  onClick,
}: {
  href: string;
  label: string;
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
      // words only (D-158): the chosen screen is marked by a line of the pen in the margin
      className={`group relative flex h-8 items-center gap-2.5 text-[14px] leading-5 outline-none transition-colors duration-[120ms] focus-visible:ring-2 focus-visible:ring-accent/45 ${
        active ? "font-semibold text-text" : "text-muted hover:text-text"
      }`}
    >
      {active ? <span aria-hidden className="absolute inset-y-1 -left-3 w-[2px] bg-accent" /> : null}
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
    return <p className="py-2 text-[13px] leading-[18px] text-muted">Ничего не нашлось. Попробуйте другое слово</p>;
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
            className={`flex w-full flex-col py-1 text-left transition-colors duration-[120ms] ${index === at ? "bg-surface-2 text-text" : "hover:bg-surface-2/60"}`}
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
 * screens that live next to them. «Очки и магазин» are the director's (D-153 §1); «Лаборатория» and
 * «Данные» — the developers' tools, a director's with the flag only (`useDevTools`).
 */
function SettingsNav({ searchRef }: { searchRef: RefObject<HTMLInputElement | null> }) {
  const { role } = useDeskScope();
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const sections = useDirtySections();
  const brand = useBrandDraft();
  const director = role === "director";
  const devTools = useDevTools();
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
  const results = query.trim() ? searchSettings(query, { director, devTools }) : null;

  const pick = (entry: SettingEntry) => {
    setQuery("");
    setAt(0);
    goDesk(router, entryHref(entry));
  };

  return (
    <nav aria-label="Разделы настроек" data-testid="settings-subnav" className="sticky top-4 w-[176px] shrink-0 self-start" onKeyDown={walkNav}>
      <div
        className="desk-fields mb-3"
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
          width={176}
        />
      </div>
      {results ? (
        <Results results={results} at={at} onPick={pick} onHover={setAt} />
      ) : (
        <>
          <SectionLabel>Настройки</SectionLabel>
          <div className="flex flex-col">
            {SETTINGS_TABS.map((key, index) => (
              <NavItem
                key={key}
                href={`/desk/settings?tab=${key}`}
                label={SETTINGS_TAB_META[key].title}
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
          <SectionLabel className="mt-4">Ещё</SectionLabel>
          <div className="flex flex-col">
            <NavItem
              href="/desk/settings/dictionary"
              label="Словарь"
              active={within(pathname, "/desk/settings/dictionary")}
              testId="settings-nav-dictionary"
            />
            {devTools ? (
              <NavItem href="/desk/settings/lab" label="Лаборатория" active={within(pathname, "/desk/settings/lab")} testId="settings-nav-lab" />
            ) : null}
            {devTools ? (
              <NavItem href="/desk/settings/data" label="Данные" active={within(pathname, "/desk/settings/data")} testId="settings-nav-data" />
            ) : null}
            {director ? (
              <NavItem
                href="/desk/settings/points"
                label="Очки и магазин"
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
  return (
    <PageSearchContext.Provider value={register}>
      <div className="flex w-full gap-10 px-8 pb-12 pt-4">
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
export function SettingsFrame({ devTools, children }: { devTools: boolean; children: ReactNode }) {
  return (
    <DevToolsContext.Provider value={devTools}>
      <SettingsDraftProvider>
        <BrandDraftProvider>
          <FrameBody>{children}</FrameBody>
        </BrandDraftProvider>
      </SettingsDraftProvider>
    </DevToolsContext.Provider>
  );
}
