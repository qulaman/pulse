"use client";

import { AnimatePresence, motion } from "framer-motion";

import { COMPANY, TABS, dayLabel, hhmm } from "@/app/dev/pulse-alt/fixtures";

import { useApi } from "./ctx";
import { Icon } from "./ui";

const WEEKDAY = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];
const MONTH = ["янв", "февр", "марта", "апр", "мая", "июня", "июля", "авг", "сент", "окт", "нояб", "дек"];

/** «вт, 10 нояб» in Aqtobe. */
function dateLine(now: Date): string {
  const w = new Date(now.getTime() + 5 * 3_600_000);
  return `${WEEKDAY[w.getUTCDay()]}, ${w.getUTCDate()} ${MONTH[w.getUTCMonth()]}`;
}

export function Header() {
  const api = useApi();
  const iso = api.now.toISOString();
  return (
    <header className="relative z-10 flex h-[54px] flex-none items-center gap-2.5 px-5">
      {/* the client's brand slot — the only place a client is named */}
      <span
        className="pc-serif inline-flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[16px]"
        style={{ background: "var(--btn)", color: "var(--on-btn)" }}
        aria-hidden
      >
        {COMPANY.initials}
      </span>
      <span className="text-[16px] font-medium tracking-[-0.01em]" style={{ color: "var(--ink)" }}>
        {COMPANY.name}
      </span>
      <span className="flex-1" />
      <AnimatePresence>
        {api.dnd ? (
          <motion.span
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="mr-1 inline-flex h-7 items-center gap-1 rounded-full px-2.5 text-[12.5px]"
            style={{ background: "var(--oat)", color: "var(--ink-2)" }}
          >
            🔕 до 12:00
          </motion.span>
        ) : null}
      </AnimatePresence>
      <span className="pc-num text-[13.5px]" style={{ color: "var(--ink-3)" }} title={dayLabel(iso, api.now)}>
        {dateLine(api.now)} · {hhmm(iso)}
      </span>
    </header>
  );
}

const TAB_ICON: Record<string, string> = { pulse: "pulse", sent: "tasks", calendar: "calendar", notes: "note", screen: "screen", profile: "person" };

export function TabBar() {
  const api = useApi();
  const badge = api.counts.waiting;
  return (
    <nav
      className="relative z-30 flex flex-none items-stretch justify-around px-1"
      style={{ background: "var(--paper)", borderTop: "1px solid var(--line)", paddingBottom: "max(env(safe-area-inset-bottom), 6px)" }}
      aria-label="Разделы"
    >
      {TABS.map((tab) => {
        const active = tab.id === "pulse";
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => {
              if (!active) api.note(`«${tab.label}» — отдельный экран, в этот прототип не входит`);
            }}
            className="pc-press relative flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] pt-1.5"
            style={{ color: active ? "var(--ink)" : "var(--ink-3)" }}
            aria-current={active ? "page" : undefined}
          >
            <span className="relative">
              <Icon name={TAB_ICON[tab.id] ?? "home"} size={23} stroke={active ? 1.9 : 1.5} />
              {active && badge > 0 ? (
                <motion.span
                  key={badge}
                  initial={{ scale: 0.6 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", damping: 12, stiffness: 400 }}
                  className="pc-num absolute -top-1.5 -right-3 inline-flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[11px] font-semibold"
                  style={{ background: "var(--clay)", color: "#fff", boxShadow: "0 0 0 2px var(--paper)" }}
                >
                  {badge}
                </motion.span>
              ) : null}
            </span>
            <span className="max-w-full truncate text-[10.5px] leading-[13px]" style={{ fontWeight: active ? 600 : 450 }}>
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
