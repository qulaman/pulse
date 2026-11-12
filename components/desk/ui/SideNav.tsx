"use client";

import {
  CalendarDays,
  CircleUser,
  ConciergeBell,
  FileText,
  Inbox,
  LayoutDashboard,
  ListChecks,
  Megaphone,
  MonitorPlay,
  NotebookPen,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PulseMark } from "@/components/brand/PulseMark";
import { StillLogo } from "@/components/ui/StillLogo";
import { useCalendar } from "@/lib/calendar/queries";
import { todayCount } from "@/lib/calendar/agenda";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { useDeskScope } from "@/components/desk/DeskScope";
import { DESK_NAV, DESK_PROFILE, DESK_PROFILE_KEY, deskNavActive, type DeskBadge, type DeskRole } from "@/lib/desk/routes";
import { activeCount, useErrands } from "@/lib/errands/queries";
import { afterHydration } from "@/lib/offline/persist";
import { useOpenDisputes } from "@/lib/points/game";
import { ordersWaiting } from "@/lib/shop/format";
import { useOrders } from "@/lib/shop/queries";
import { inboxCounts, useDirectorInbox, useMe } from "@/lib/tasks/queries";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector } from "@/lib/visits/text";

export type DeskBrand = { name: string; logoUrl: string | null; pointsEnabled: boolean };

/** Asked once the screen has hydrated, like the tab bar's counts (D-143): no data the server never had. */
export function useSettled(): boolean {
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    let gone = false;
    void afterHydration().then(() => {
      if (!gone) setSettled(true);
    });
    return () => {
      gone = true;
    };
  }, []);
  return settled;
}

function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export type DeskBadges = { counts: Partial<Record<DeskBadge, number>>; tones: Partial<Record<DeskBadge, Tone>> };

/**
 * The counts on the side navigation — the same queries as the phone's tab bar and orbs, so a
 * number never disagrees with the list behind it (D-153 §3): «Задачи» — everything waiting for
 * the director (danger with an overdue one, warn otherwise), «Заявки» — open errands and, for the
 * director, visitors waiting for an answer; for the secretary — requests nobody has taken yet,
 * «Календарь» — today's meetings still ahead, «Сегодня» — what waits for the director besides
 * tasks: open disputes and orders. The same counts name the browser tab (DeskShell).
 */
export function useDeskBadges(role: DeskRole): DeskBadges {
  const me = useMe().data;
  const settled = useSettled();
  const director = role === "director";
  const { pointsEnabled } = useDeskScope();
  const game = director && pointsEnabled && settled;
  const disputes = useOpenDisputes(game);
  const orders = useOrders(game);
  const inbox = useDirectorInbox(me, director && settled);
  const errands = useErrands(settled);
  const visits = useVisits(director && settled);
  const calendar = useCalendar(settled);
  const now = useMinute();
  return useMemo(() => {
    const ask = inbox.data ? inboxCounts(inbox.data) : null;
    const open = director
      ? activeCount(errands.data) + awaitingDirector(visits.data ?? []).length
      : (errands.data ?? []).filter((errand) => errand.status === "sent").length;
    const besides = game ? (disputes.data?.length ?? 0) + ordersWaiting(orders.data ?? [], me?.userId).length : 0;
    return {
      counts: {
        today: besides,
        tasks: ask?.total ?? 0,
        errands: open,
        calendar: calendar.data ? todayCount(calendar.data, now) : 0,
      },
      tones: { today: "warn", tasks: ask && ask.overdue > 0 ? "danger" : "warn", errands: "accent", calendar: "muted" },
    };
  }, [calendar.data, director, disputes.data, errands.data, game, inbox.data, me?.userId, now, orders.data, visits.data]);
}

/** Each section's sign (lucide, D-165): beside the name in the wide navigation, alone when folded. */
const ICON: Record<string, LucideIcon> = {
  "/desk/today": LayoutDashboard,
  "/desk/tasks": ListChecks,
  "/desk/inbox": Inbox,
  "/desk/team": Users,
  "/desk/errands": ConciergeBell,
  "/desk/ether": Megaphone,
  "/desk/reports": FileText,
  "/desk/calendar": CalendarDays,
  "/desk/notes": NotebookPen,
  "/desk/screen": MonitorPlay,
  "/desk/settings": Settings,
  [DESK_PROFILE]: CircleUser,
};

function NavIcon({ href }: { href: string }) {
  const Glyph = ICON[href] ?? LayoutDashboard;
  return <Glyph size={17} strokeWidth={1.9} aria-hidden />;
}

/**
 * The chosen section's plate (D-171): one element that glides from the section left to the one
 * chosen, on a spring without overshoot. «Журнал» draws the chosen tab itself and hides it.
 */
const NAV_GLIDE = { type: "spring", stiffness: 520, damping: 42, mass: 0.8 } as const;

/** A count is a number on the binding; only something overdue takes the red pencil. */
function badgeColors(tone: Tone | undefined) {
  return tone === "danger" ? { background: TONE_VAR.danger, color: "#fff" } : { color: "inherit" };
}

function NavLink({
  href,
  label,
  count,
  tone,
  active,
  chord,
  folded,
}: {
  href: string;
  label: string;
  count?: number;
  tone?: Tone;
  active: boolean;
  chord?: string;
  folded: boolean;
}) {
  const shown = count ? (count > 99 ? "99+" : String(count)) : null;
  return (
    <Tooltip label={label} keys={chord ? ["G", chord] : undefined} side="right" className="flex w-full">
      <Link
        href={href}
        prefetch
        aria-current={active ? "page" : undefined}
        aria-label={count ? `${label}, ${count}` : label}
        data-chord={chord}
        // «Журнал»: the chosen section is a tab of the sheet, words alone (journal.css); «Графит»: an
        // icon beside every name and a plate that glides to the chosen one (graphite.css, D-171)
        className={`desk-focus desk-nav-link group relative flex w-full items-center leading-5 ${folded ? "justify-center px-0" : "gap-2.5 pl-2.5 pr-3.5"}`}
      >
        {active ? <motion.span layoutId="desk-nav-active" aria-hidden className="desk-nav-active" transition={NAV_GLIDE} /> : null}
        <span className="desk-nav-icon relative z-[1] inline-flex shrink-0">
          <NavIcon href={href} />
          {folded && shown ? (
            <span className="nums absolute -right-2.5 -top-2 min-w-[16px] text-center text-[10px] leading-[15px]" style={badgeColors(tone)} data-testid="nav-badge" data-tone={tone}>
              {shown}
            </span>
          ) : null}
        </span>
        {folded ? null : <span className="relative z-[1] min-w-0 flex-1 truncate">{label}</span>}
        {!folded && shown ? (
          <span className="nums relative z-[1] text-center" style={badgeColors(tone)} data-testid="nav-badge" data-tone={tone}>
            {shown}
          </span>
        ) : null}
      </Link>
    </Tooltip>
  );
}

function FoldIcon({ folded }: { folded: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <path d="M9.5 4.5v15" />
      <path d={folded ? "M13.5 10l2 2-2 2" : "M16 10l-2 2 2 2"} />
    </svg>
  );
}

/** The product's mark without its name — the folded navigation's head and foot. */
function PulseGlyphMark() {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" aria-label="Pulse" role="img">
      <polyline points="0,10 6,10 9,3 13,15 16,8 19,10 26,10" fill="none" stroke="var(--accent)" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The desk's side navigation (D-153 §3): the client's logo on top as on the phone's home header
 * (D-113) — the logo alone, the company's name in its title, never cut to «West Arlan …»; the
 * role's sections with their counts in the tone of the move; the product's own mark at the foot
 * above «Профиль» (D-44: the product's identity comes first). Every section answers to «G» and
 * its letter and says so under the mouse; `folded` — icons only, 64 px, the counts on their
 * corners and the names in the hints (D-154 wave 3; «[» or the button at the foot).
 */
export function SideNav({ role, brand, folded = false, onToggle }: { role: DeskRole; brand: DeskBrand; folded?: boolean; onToggle?: () => void }) {
  const pathname = usePathname();
  const badges = useDeskBadges(role);
  const active = deskNavActive(pathname, role);
  const logo = brand.logoUrl;
  const named = !logo && brand.name !== "Pulse";
  const foldLabel = folded ? "Развернуть навигацию" : "Свернуть навигацию";

  return (
    <nav aria-label="Разделы" data-folded={folded ? "" : undefined} className="desk-nav flex min-h-0 flex-col">
      <div className={`mb-6 flex h-9 items-center ${folded ? "justify-center" : "px-2"}`} title={brand.name}>
        {logo ? (
          // a still frame of the client's logo: an animated one would keep the main thread awake (В-9, D-155)
          <StillLogo src={logo} alt={brand.name} className={folded ? "h-6 max-w-[44px] object-contain" : "h-8 max-w-[176px] object-contain object-left"} />
        ) : named ? (
          <span className="font-display text-[16px] font-bold leading-5 tracking-[-0.02em]">{folded ? brand.name.slice(0, 1) : brand.name}</span>
        ) : folded ? (
          <PulseGlyphMark />
        ) : (
          <PulseMark />
        )}
      </div>
      <ul className="no-bar flex min-h-0 flex-col overflow-y-auto">
        {DESK_NAV[role].map((item) => (
          <li key={item.href}>
            <NavLink
              href={item.href}
              label={item.label}
              count={item.badge ? badges.counts[item.badge] : undefined}
              tone={item.badge ? badges.tones[item.badge] : undefined}
              active={active === item.href}
              chord={item.key}
              folded={folded}
            />
          </li>
        ))}
      </ul>
      <div className="desk-nav-foot mt-auto flex flex-col gap-2 border-t pt-3">
        <NavLink href={DESK_PROFILE} label="Профиль" active={active === DESK_PROFILE} chord={DESK_PROFILE_KEY} folded={folded} />
        <div className={`flex items-center ${folded ? "flex-col gap-2" : "justify-between pl-3"}`}>
          {logo || named ? <span className="opacity-50">{folded ? <PulseGlyphMark /> : <PulseMark />}</span> : <span aria-hidden />}
          {onToggle ? (
            <Tooltip label={foldLabel} keys={["["]} side={folded ? "right" : "top"}>
              <button
                type="button"
                onClick={onToggle}
                aria-label={foldLabel}
                aria-pressed={folded}
                data-testid="desk-nav-fold"
                className="desk-focus flex h-8 w-8 items-center justify-center rounded-[8px] text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
              >
                <FoldIcon folded={folded} />
              </button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </nav>
  );
}
