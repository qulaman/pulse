"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PulseMark } from "@/components/brand/PulseMark";
import { StillLogo } from "@/components/ui/StillLogo";
import { useCalendar } from "@/lib/calendar/queries";
import { todayCount } from "@/lib/calendar/agenda";
import { Tooltip } from "@/components/desk/ui/Tooltip";
import { TONE_VAR, type Tone } from "@/components/desk/ui/tone";
import { DESK_NAV, DESK_PROFILE, DESK_PROFILE_KEY, deskNavActive, type DeskBadge, type DeskRole } from "@/lib/desk/routes";
import { activeCount, useErrands } from "@/lib/errands/queries";
import { afterHydration } from "@/lib/offline/persist";
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
 * «Календарь» — today's meetings still ahead. The same counts name the browser tab (DeskShell).
 */
export function useDeskBadges(role: DeskRole): DeskBadges {
  const me = useMe().data;
  const settled = useSettled();
  const director = role === "director";
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
    return {
      counts: {
        tasks: ask?.total ?? 0,
        errands: open,
        calendar: calendar.data ? todayCount(calendar.data, now) : 0,
      },
      tones: { tasks: ask && ask.overdue > 0 ? "danger" : "warn", errands: "accent", calendar: "muted" },
    };
  }, [calendar.data, director, errands.data, inbox.data, now, visits.data]);
}

const ICON: Record<string, string> = {
  "/desk/today": "M12 4.5v2M12 17.5v2M4.5 12h2M17.5 12h2M6.7 6.7l1.4 1.4M15.9 15.9l1.4 1.4M6.7 17.3l1.4-1.4M15.9 8.1l1.4-1.4M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
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

function badgeColors(tone: Tone | undefined) {
  const quiet = !tone || tone === "muted";
  return {
    background: quiet ? "var(--surface-2)" : `color-mix(in srgb, ${TONE_VAR[tone]} 18%, transparent)`,
    color: quiet ? "var(--text)" : TONE_VAR[tone],
  };
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
        // the chosen section: a line of the accent at the left edge and full-strength words, no fill (D-154)
        className={`desk-focus group relative flex h-9 w-full items-center rounded-[10px] text-[14px] font-medium leading-5 transition-colors duration-[120ms] ${
          folded ? "justify-center px-0" : "gap-2.5 px-3"
        } ${active ? "bg-surface-2/60 text-text" : "text-muted hover:bg-surface-2/60 hover:text-text"}`}
      >
        {active ? <span aria-hidden className={`absolute inset-y-2 w-[2px] rounded-full bg-accent ${folded ? "-left-2" : "left-0"}`} /> : null}
        <span className={`relative ${active ? "text-accent" : ""}`}>
          <NavIcon href={href} />
          {folded && shown ? (
            // folded: the count rides the icon's corner, in the same tone
            <span
              className="nums absolute -right-2.5 -top-2 min-w-[16px] rounded-full px-1 text-center text-[10px] font-bold leading-[15px]"
              style={{ ...badgeColors(tone), boxShadow: "0 0 0 2px var(--bg)" }}
              data-testid="nav-badge"
            >
              {shown}
            </span>
          ) : null}
        </span>
        {folded ? null : <span className="min-w-0 flex-1 truncate">{label}</span>}
        {!folded && shown ? (
          <span className="nums min-w-[20px] rounded-full px-1.5 text-center text-[11px] font-bold leading-[18px]" style={badgeColors(tone)} data-testid="nav-badge">
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
    <nav aria-label="Разделы" data-folded={folded ? "" : undefined} className={`flex min-h-0 flex-col border-r border-border bg-surface/60 pb-3 pt-4 ${folded ? "px-2" : "px-3"}`}>
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
      <ul className="no-bar flex min-h-0 flex-col gap-0.5 overflow-y-auto">
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
      <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
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
