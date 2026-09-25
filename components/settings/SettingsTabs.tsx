"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

import { TeamRoster } from "@/components/people/TeamRoster";
import { CompanyForm } from "@/components/settings/CompanyForm";
import { DemoReset } from "@/components/settings/DemoReset";
import { SettingsDraftProvider, SettingsReady, useDirtySections } from "@/components/settings/draft";
import { DirtyDot, SETTINGS_TAB_META, SETTINGS_THUMB, SettingsTiles } from "@/components/settings/SettingsTiles";
import {
  BookIcon,
  CalendarIcon,
  CupIcon,
  GiftIcon,
  ListIcon,
  LoadIcon,
  PodiumIcon,
  TableIcon,
  TvIcon,
} from "@/components/settings/icons";
import {
  ConventionsSection,
  DictionarySection,
  MascotSection,
  ParserSection,
  PointsSection,
  SecretarySection,
  SttSection,
  WindowSection,
} from "@/components/settings/sections";
import { SETTINGS_TABS, type SettingsTab } from "@/lib/settings-tabs";
import { Button } from "@/components/ui/Button";
import { TeamListBone } from "@/components/ui/PageSkeletons";
import { Row, RowGroup } from "@/components/ui/Row";
import { usePeople } from "@/lib/people/queries";
import { usePushHealth } from "@/lib/push/health-query";
import type { Role } from "@/lib/routes";
import { useMe } from "@/lib/tasks/queries";
import { useBandStuck, useHeaderHeight } from "@/lib/useHeaderHeight";

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

/**
 * Настройки as four tabs (D-85): Компания, Программа, Сотрудники, ИИ-модель. The tiles on
 * top are the tabs — a tap swaps the content below in place, a raised thumb slides to the
 * chosen tile and the new content slides in from its side. Scrolled past the tiles, a
 * compact bar pins under the header, so a long tab (the roster) never strands the director.
 * A tab is mounted on its first visit and then only hidden, so open sections, a half-typed
 * logo name and the roster's search survive a trip to another tab; settings edits live in
 * the draft above all tabs, and a tile wears a dot while its tab holds unsaved edits.
 * The secretary gets the same four tabs (D-104) without the director's own modules.
 */
export function SettingsTabs({ initialTab, role }: { initialTab: SettingsTab; role: Role }) {
  return (
    <SettingsDraftProvider>
      <TabsBody initialTab={initialTab} director={role === "director"} />
    </SettingsDraftProvider>
  );
}

function TabsBody({ initialTab, director }: { initialTab: SettingsTab; director: boolean }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<SettingsTab>>(() => new Set([initialTab]));
  const [move, setMove] = useState<Move>({ dir: 1, n: 0 });
  const [companyDirty, setCompanyDirty] = useState(false);
  const sections = useDirtySections();
  const dirty: Record<SettingsTab, boolean> = {
    company: companyDirty || !!sections.window,
    app: !!(sections.secretary || sections.mascot),
    team: !!sections.points,
    ai: !!(sections.stt || sections.parser || sections.conventions),
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
  useBandStuck(pinned);

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
      <SettingsTiles tab={tab} dirty={dirty} onSelect={select} tilesRef={tilesRef} />

      {pinned ? (
        <div className="settings-bar-in nav-glass fixed inset-x-0 z-[6] border-b border-border/70" style={{ top }}>
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
                    {active ? <motion.span layoutId="settings-bar" transition={SETTINGS_THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
                    <span className="relative z-[1] flex items-center justify-center gap-1 whitespace-nowrap">
                      {SETTINGS_TAB_META[key].short}
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
                <AppPanel director={director} />
              ) : key === "team" ? (
                <TeamPanel director={director} />
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

/**
 * The app's modules and the one module with a catalogue of its own — the secretary's
 * buttons. Tasks, the wall remote and the raw tables are the director's screens (D-104).
 */
function AppPanel({ director }: { director: boolean }) {
  return (
    <>
      <h2 className="eyebrow px-1">Модули</h2>
      <RowGroup className="mt-2">
        {director ? <Row icon={<ListIcon />} title="Задачи" value="весь список" href="/sent" /> : null}
        <Row icon={<CupIcon />} title="Заявки" value="кофе, врач, «зайди ко мне»" href="/secretary" />
        {director ? <Row icon={<TvIcon />} title="Экран" value="пульт от телевизора" href="/screen" /> : null}
        {director ? <Row icon={<TableIcon />} title="Данные" value="таблицы как есть" href="/admin" /> : null}
      </RowGroup>
      <div className="mt-2">
        <SettingsReady bones={1}>
          <SecretarySection />
        </SettingsReady>
      </div>
      <div className="mt-2">
        <SettingsReady bones={1}>
          <MascotSection />
        </SettingsReady>
      </div>

      {/* a demo instance only: the value is inlined at build time, a client's prod never sets it */}
      {director && process.env.NEXT_PUBLIC_DEMO_MODE === "1" ? (
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

/**
 * The people themselves (D-104): the roster by role, a tap opens the person's editor —
 * role, card, password. The load board («Команда») is the director's: the secretary
 * sees nobody's tasks, so it would show her an idle company.
 */
function TeamPanel({ director }: { director: boolean }) {
  const people = usePeople();
  const me = useMe();
  const push = usePushHealth();
  // people who hear about work only by opening Pulse (D-114); the wall has no phone
  const deaf = (people.data ?? []).filter(
    (p) => p.is_active && p.role !== "tv" && ["off", "broken"].includes(push.data?.get(p.id)?.state ?? "ok"),
  ).length;

  return (
    <>
      <div className="flex flex-col gap-2">
        <SettingsReady bones={1}>
          <PointsSection />
        </SettingsReady>
        <RowGroup>
          {director ? <Row icon={<LoadIcon />} title="Загрузка команды" value="кто чем занят" href="/people" /> : null}
          <Row icon={<PodiumIcon />} title="Рейтинг" value="очки и динамика" href="/rating" />
          <Row icon={<GiftIcon />} title="Магазин" value="награды и выдача" href="/shop" />
          {/* how the director calls people lives with the words of the dictionary (D-111) */}
          <Row icon={<BookIcon />} title="Имена в речи" value="как вы их зовёте" href="/settings/dictionary?tab=names&from=team" />
        </RowGroup>
      </div>

      {/* the roster counts itself below; adding a person lives where the people are */}
      <div className="mt-6 flex items-center justify-between gap-3 px-1">
        <h2 className="eyebrow">Все сотрудники</h2>
        <Link href="/people/new" className="shrink-0">
          <Button size="sm">+ Добавить</Button>
        </Link>
      </div>
      {deaf > 0 ? (
        <p className="mt-2 rounded-[12px] border border-danger/40 bg-danger/10 px-3 py-2 text-[13px] leading-[18px] text-danger">
          {deaf === 1 ? "У 1 человека не работают уведомления" : `У ${deaf} человек не работают уведомления`} — о задачах они узнают, только
          открыв Pulse. Откройте карточку: там «Прислать проверку».
        </p>
      ) : null}
      {people.isLoading ? (
        <TeamListBone />
      ) : (
        <TeamRoster
          people={people.data ?? []}
          me={me.data ? { id: me.data.userId, role: me.data.role } : null}
          push={push.data}
        />
      )}
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
        <DictionarySection />
        <ConventionsSection />
      </div>
    </SettingsReady>
  );
}
