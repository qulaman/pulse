"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { TeamList } from "@/components/people/TeamList";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { DemoReset } from "@/components/settings/DemoReset";
import { SettingsDraftProvider, SettingsReady, useDirtySections } from "@/components/settings/draft";
import {
  AppsIcon,
  BuildingIcon,
  CalendarIcon,
  CupIcon,
  GiftIcon,
  ListIcon,
  LoadIcon,
  PeopleIcon,
  PodiumIcon,
  SparkIcon,
  TableIcon,
  TvIcon,
} from "@/components/settings/icons";
import {
  ConventionsSection,
  ParserSection,
  PointsSection,
  SecretarySection,
  SttSection,
  VocabularySection,
  WindowSection,
} from "@/components/settings/sections";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";
import { Button } from "@/components/ui/Button";
import { TeamListBone } from "@/components/ui/PageSkeletons";
import { Row, RowGroup } from "@/components/ui/Row";
import { useTeamLoads } from "@/lib/people/loads";
import { usePeople } from "@/lib/people/queries";
import { usePointsEnabled } from "@/lib/points/queries";
import { useHeaderHeight } from "@/lib/useHeaderHeight";

const TABS: Record<SettingsTab, { title: string; short: string; about: string; icon: ReactNode }> = {
  company: { title: "Компания", short: "Компания", about: "название, логотип, часы", icon: <BuildingIcon /> },
  app: { title: "Программа", short: "Программа", about: "модули и секретарь", icon: <AppsIcon /> },
  team: { title: "Сотрудники", short: "Сотрудники", about: "люди, роли, очки", icon: <PeopleIcon /> },
  ai: { title: "ИИ-модель", short: "ИИ", about: "речь, разбор, словарь", icon: <SparkIcon /> },
};

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };
/** The pinned bar's height, 36px segments in a padded band: a switch from it starts the new tab below it. */
const BAR_H = 54;

/** A switch: which way the tiles moved (the new tab slides in from that side) and a counter that replays it. */
type Move = { dir: 1 | -1; n: number };

/**
 * Whether `ref` has scrolled up under the header and the bar's band below it: the tiles
 * are gone and the pinned bar takes over (it covers exactly the band where the tiles'
 * last pixels would be). `onBack` fires when the tiles come back into view.
 */
function useScrolledPast(ref: RefObject<HTMLElement | null>, top: number, onBack: () => void): boolean {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const edge = Math.round(top) + BAR_H;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const gone = !entry.isIntersecting && entry.boundingClientRect.top < edge;
        setPast(gone);
        if (!gone) onBack();
      },
      { rootMargin: `-${edge}px 0px 0px 0px` },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, top, onBack]);
  return past;
}

function DirtyDot() {
  return <span aria-label="есть несохранённое" className="block h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--accent)" }} />;
}

/**
 * Настройки as four tabs (D-85): Компания, Программа, Сотрудники, ИИ-модель. The tiles on
 * top are the tabs — a tap swaps the content below in place, a raised thumb slides to the
 * chosen tile and the new content slides in from its side. Scrolled past the tiles, a
 * compact bar pins under the header, so a long tab (the roster) never strands the director.
 * A tab is mounted on its first visit and then only hidden, so open sections, a half-typed
 * logo name and the roster's search survive a trip to another tab; settings edits live in
 * the draft above all tabs, and a tile wears a dot while its tab holds unsaved edits.
 */
export function SettingsTabs({ initialTab }: { initialTab: SettingsTab }) {
  return (
    <SettingsDraftProvider>
      <TabsBody initialTab={initialTab} />
    </SettingsDraftProvider>
  );
}

function TabsBody({ initialTab }: { initialTab: SettingsTab }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([initialTab]));
  const [move, setMove] = useState<Move>({ dir: 1, n: 0 });
  const [companyDirty, setCompanyDirty] = useState(false);
  const sections = useDirtySections();
  const dirty: Record<SettingsTab, boolean> = {
    company: companyDirty || !!sections.window,
    app: !!sections.secretary,
    team: !!sections.points,
    ai: !!(sections.stt || sections.parser || sections.vocabulary || sections.conventions),
  };

  const top = useHeaderHeight();
  const tilesRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  // A switch from the pinned bar keeps the page at least a screen tall below the bar: a
  // short tab would otherwise let the browser clamp the scroll, the tiles would slide back
  // half-cut and the bar would vanish under the finger. Released once the tiles are back.
  const [hold, setHold] = useState(false);
  const release = useCallback(() => setHold(false), []);
  const pinned = useScrolledPast(tilesRef, top, release);

  const select = (next: SettingsTab) => {
    if (next === tab) return;
    setMove((m) => ({ dir: SETTINGS_TABS.indexOf(next) > SETTINGS_TABS.indexOf(tab) ? 1 : -1, n: m.n + 1 }));
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    // the address keeps the tab: a reload, a link from elsewhere and «назад» from a module land on it
    window.history.replaceState(null, "", `?tab=${next}`);
    // switched from the pinned bar: the new tab starts from its top, right under the bar
    const panels = panelsRef.current;
    if (pinned && panels) {
      setHold(true);
      window.scrollTo({ top: panels.getBoundingClientRect().top + window.scrollY - top - BAR_H - 8 });
    }
  };

  return (
    <>
      <div ref={tilesRef} role="tablist" aria-label="Разделы настроек" className="mt-5 grid grid-cols-2 gap-2">
        {SETTINGS_TABS.map((key) => {
          const meta = TABS[key];
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`settings-tab-${key}`}
              aria-controls={`settings-panel-${key}`}
              aria-selected={active}
              data-testid={`settings-tab-${key}`}
              onClick={() => select(key)}
              className="settings-tile relative flex min-h-[104px] flex-col rounded-[16px] p-3 text-left transition-transform duration-[120ms] active:scale-[0.98]"
            >
              {active ? (
                <motion.span layoutId="settings-tile" transition={THUMB} className="settings-tile-on absolute -inset-px rounded-[16px]" />
              ) : null}
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
                {dirty[key] ? (
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

      {pinned ? (
        <div className="settings-bar-in fixed inset-x-0 z-[6] border-b border-border/70 bg-bg" style={{ top }}>
          <div className="mx-auto w-full max-w-lg px-4 py-2">
            <div role="tablist" aria-label="Разделы настроек" className="seg flex gap-1 rounded-[14px] p-1">
              {SETTINGS_TABS.map((key) => {
                const active = key === tab;
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-controls={`settings-panel-${key}`}
                    data-testid={`settings-bar-${key}`}
                    onClick={() => select(key)}
                    className={`relative min-h-[36px] flex-auto rounded-[10px] px-1 font-display text-[12px] font-semibold leading-4 tracking-[-0.01em] transition-colors duration-[120ms] min-[360px]:px-2 min-[360px]:text-[13px] ${
                      active ? "text-text" : "text-muted active:text-text"
                    }`}
                  >
                    {active ? <motion.span layoutId="settings-bar" transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
                    <span className="relative z-[1] flex items-center justify-center gap-1 whitespace-nowrap">
                      {TABS[key].short}
                      {dirty[key] ? <DirtyDot /> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      <div ref={panelsRef} className="mt-5" style={hold ? { minHeight: `calc(100dvh - ${Math.round(top) + BAR_H + 8}px)` } : undefined}>
        {SETTINGS_TABS.map((key) =>
          visited.has(key) ? (
            <TabPanel key={key} id={key} active={key === tab} move={move}>
              {key === "company" ? (
                <CompanyPanel onCompanyDirty={setCompanyDirty} />
              ) : key === "app" ? (
                <AppPanel />
              ) : key === "team" ? (
                <TeamPanel />
              ) : (
                <AiPanel />
              )}
            </TabPanel>
          ) : null,
        )}
      </div>
    </>
  );
}

function TabPanel({ id, active, move, children }: { id: SettingsTab; active: boolean; move: Move; children: ReactNode }) {
  const ref = useRef<HTMLElement>(null);

  // Before paint, so the first frame is already the start of the slide. No fill: once it
  // ends nothing stays transformed (DESIGN §2 — transform and opacity only).
  useLayoutEffect(() => {
    const node = ref.current;
    if (!active || !node || move.n === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    node.animate(
      [
        { opacity: 0, transform: `translateX(${move.dir * 24}px)` },
        { opacity: 1, transform: "translateX(0)" },
      ],
      { duration: 260, easing: "cubic-bezier(0.2, 0, 0, 1)" },
    );
  }, [active, move]);

  return (
    <section ref={ref} role="tabpanel" id={`settings-panel-${id}`} aria-labelledby={`settings-tab-${id}`} hidden={!active}>
      {children}
    </section>
  );
}

/** How the company looks in the app and when its people get work. */
function CompanyPanel({ onCompanyDirty }: { onCompanyDirty: (dirty: boolean) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <CompanyForm onDirtyChange={onCompanyDirty} />
      <SettingsReady bones={1}>
        <WindowSection />
      </SettingsReady>
      <RowGroup>
        <Row icon={<CalendarIcon />} title="Календарь" value="мероприятия" href="/calendar" />
      </RowGroup>
    </div>
  );
}

/** The app's modules and the one module with a catalogue of its own — the secretary's buttons. */
function AppPanel() {
  return (
    <>
      <h2 className="eyebrow px-1">Модули</h2>
      <RowGroup className="mt-2">
        <Row icon={<ListIcon />} title="Задачи" value="весь список" href="/sent" />
        <Row icon={<CupIcon />} title="Заявки" value="кофе, врач, «зайди ко мне»" href="/secretary" />
        <Row icon={<TvIcon />} title="Экран" value="пульт от телевизора" href="/screen" />
        <Row icon={<TableIcon />} title="Данные" value="таблицы как есть" href="/admin" />
      </RowGroup>
      <div className="mt-2">
        <SettingsReady bones={1}>
          <SecretarySection />
        </SettingsReady>
      </div>

      {/* a demo instance only: the value is inlined at build time, a client's prod never sets it */}
      {process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
        <>
          <h2 className="eyebrow mt-6 px-1">Демо</h2>
          <div className="mt-2">
            <DemoReset />
          </div>
        </>
      ) : null}
    </>
  );
}

/** The people themselves: a tap on a person opens their card — role, aliases, password. */
function TeamPanel() {
  const people = usePeople();
  const loads = useTeamLoads();
  const pointsOn = usePointsEnabled().data === true;

  return (
    <>
      <div className="flex flex-col gap-2">
        <SettingsReady bones={1}>
          <PointsSection />
        </SettingsReady>
        <RowGroup>
          <Row icon={<LoadIcon />} title="Загрузка команды" value="кто чем занят" href="/people" />
          <Row icon={<PodiumIcon />} title="Рейтинг" value="очки и динамика" href="/rating" />
          <Row icon={<GiftIcon />} title="Магазин" value="награды и выдача" href="/shop" />
        </RowGroup>
      </div>

      {/* the roster counts itself below; adding a person lives where the people are */}
      <div className="mt-6 flex items-center justify-between gap-3 px-1">
        <h2 className="eyebrow">Все сотрудники</h2>
        <Link href="/people/new" className="shrink-0">
          <Button size="sm">+ Добавить</Button>
        </Link>
      </div>
      {people.isLoading ? <TeamListBone /> : <TeamList people={people.data ?? []} loads={loads.data} pointsOn={pointsOn} />}
    </>
  );
}

/** How a voice becomes work: hearing it, reading it, the company's words and deadlines. */
function AiPanel() {
  return (
    <SettingsReady bones={4}>
      <div className="flex flex-col gap-2">
        <SttSection />
        <ParserSection />
        <VocabularySection />
        <ConventionsSection />
      </div>
    </SettingsReady>
  );
}
