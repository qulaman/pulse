"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PulseMark } from "@/components/brand/PulseMark";
import { useCalendar } from "@/lib/calendar/queries";
import { todayCount } from "@/lib/calendar/agenda";
import { DESK_NAV, DESK_PROFILE, deskNavActive, type DeskBadge, type DeskRole } from "@/lib/desk/routes";
import { activeCount, useErrands } from "@/lib/errands/queries";
import { afterHydration } from "@/lib/offline/persist";
import { queueOf } from "@/lib/tasks/desk";
import { inboxCounts, useDirectorInbox, useMe, usePulseBoard } from "@/lib/tasks/queries";
import { useVisits } from "@/lib/visits/queries";
import { awaitingDirector } from "@/lib/visits/text";

export type DeskBrand = { name: string; logoUrl: string | null; pointsEnabled: boolean };

/** Asked once the screen has hydrated, like the tab bar's counts (D-143): no data the server never had. */
function useSettled(): boolean {
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

/**
 * The counts on the side navigation — the same queries as the phone's tab bar and orbs, so a
 * number never disagrees with the list behind it (D-153 §3): «Задачи» — everything waiting for
 * the director, «Разобрать» — its queue, «Заявки» — open errands (and visitors waiting for the
 * director's answer), «Календарь» — today's meetings still ahead.
 */
function useDeskBadges(role: DeskRole): Partial<Record<DeskBadge, number>> {
  const me = useMe().data;
  const settled = useSettled();
  const director = role === "director";
  const inbox = useDirectorInbox(me, director && settled);
  const board = usePulseBoard(me, director && settled);
  const errands = useErrands(settled);
  const visits = useVisits(director && settled);
  const calendar = useCalendar(settled);
  const now = useMinute();
  return useMemo(() => {
    const queue = board.data ? queueOf(board.data, now).length : 0;
    return {
      tasks: inbox.data ? inboxCounts(inbox.data).total : 0,
      inbox: queue,
      errands: activeCount(errands.data) + (director ? awaitingDirector(visits.data ?? []).length : 0),
      calendar: calendar.data ? todayCount(calendar.data, now) : 0,
    };
  }, [board.data, calendar.data, director, errands.data, inbox.data, now, visits.data]);
}

const ICON: Record<string, string> = {
  "/desk/tasks": "M4 7h2l1.5 1.5L10 6M12 7h8M4 13.5h2l1.5 1.5L10 12.5M12 13.5h8M12 19h8M5.5 19h1",
  "/desk/inbox": "M4 13h4l1.5 2.5h5L16 13h4M5.5 6h13L20 13v5.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18.5V13z",
  "/desk/team": "M9 11a3.2 3.2 0 1 0 0-6.4A3.2 3.2 0 0 0 9 11zM3 19.5a6 6 0 0 1 12 0M16 11.2a2.8 2.8 0 1 0-.6-5.5M17.5 14a5.5 5.5 0 0 1 3.5 5.5",
  "/desk/errands": "M5 8h14l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H7.7a1.5 1.5 0 0 1-1.5-1.3zM9 8V6.5a3 3 0 0 1 6 0V8",
  "/desk/reports": "M6 3.5h8.5L19 8v12.5H6zM14.5 3.5V8H19M9 12.5h6.5M9 16h4",
  "/desk/calendar": "M3.5 5h17v15.5h-17zM3.5 10h17M8 3v4M16 3v4",
  "/desk/notes": "M6 3.5h7.5L19 9v11.5H6zM13.5 3.5V9H19M9 13h6.5M9 16.5h4",
  "/desk/screen": "M3 4.5h18v12H3zM8.5 20h7M12 16.5V20",
  "/desk/settings": "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8",
  [DESK_PROFILE]: "M12 12a3.6 3.6 0 1 0 0-7.2 3.6 3.6 0 0 0 0 7.2zM4.5 20a7.5 7.5 0 0 1 15 0",
};

function NavIcon({ href }: { href: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d={ICON[href] ?? ""} />
    </svg>
  );
}

function NavLink({ href, label, count, active }: { href: string; label: string; count?: number; active: boolean }) {
  return (
    <Link
      href={href}
      prefetch
      aria-current={active ? "page" : undefined}
      aria-label={count ? `${label}, ${count}` : label}
      className={`group flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium leading-5 transition-colors duration-[120ms] ${
        active ? "bg-accent/12 text-text" : "text-muted hover:bg-surface-2 hover:text-text"
      }`}
    >
      <span className={active ? "text-accent" : ""}>
        <NavIcon href={href} />
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? (
        <span
          className={`nums rounded-full px-1.5 text-[11px] font-bold leading-[18px] ${active ? "bg-accent text-bg" : "bg-surface-2 text-text"}`}
          data-testid="nav-badge"
        >
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
    </Link>
  );
}

/**
 * The desk's side navigation (D-153 §3): the client's logo as on the phone's home header (D-113),
 * the role's sections with their counts, «Профиль» at the foot.
 */
export function SideNav({ role, brand }: { role: DeskRole; brand: DeskBrand }) {
  const pathname = usePathname();
  const badges = useDeskBadges(role);
  const active = deskNavActive(pathname, role);
  const branded = Boolean(brand.logoUrl) || brand.name !== "Pulse";

  return (
    <nav aria-label="Разделы" className="flex min-h-0 flex-col border-r border-border bg-surface/60 px-3 pb-3 pt-4">
      <div className="mb-5 flex h-8 items-center gap-2.5 px-2">
        {branded ? (
          <>
            {brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- client logo from the public bucket
              <img src={brand.logoUrl} alt="" className="h-7 max-w-[96px] shrink-0 object-contain" />
            ) : (
              <PulseMark />
            )}
            <span className="truncate font-display text-[15px] font-bold leading-5 tracking-[-0.02em]">{brand.name}</span>
          </>
        ) : (
          <PulseMark />
        )}
      </div>
      <ul className="flex flex-col gap-0.5">
        {DESK_NAV[role].map((item) => (
          <li key={item.href}>
            <NavLink href={item.href} label={item.label} count={item.badge ? badges[item.badge] : undefined} active={active === item.href} />
          </li>
        ))}
      </ul>
      <div className="mt-auto border-t border-border pt-3">
        <NavLink href={DESK_PROFILE} label="Профиль" active={active === DESK_PROFILE} />
      </div>
    </nav>
  );
}
