"use client";

import { useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";

import { periodOf, type PeriodKind } from "@/lib/daily-report/format";
import { useTeamDailyReportPeriod } from "@/lib/daily-report/queries";
import { useReportsFeed, useUncheckedReportsCount } from "@/lib/daily-report/review";
import { readReportsAddress, reportsHref, type ReportsAddress } from "@/lib/daily-report/team-feed";
import { todayYmd, type Ymd } from "@/lib/datetime/calendar";
import { useNamesKey } from "@/lib/people/names";
import { useMe } from "@/lib/tasks/queries";
import { useHydrated } from "@/lib/useHydrated";
import { useNow } from "@/lib/useNow";

import { TeamReportsSkeleton } from "./TeamSkeletons";
import { TeamReportsView } from "./TeamReportsView";

/**
 * «Отчёты» of the director on the phone (D-152, D-198) with its data. Everything on screen lives in
 * the address (`?tab=period`, `?who`, `?only=new`, `?day` — lib/daily-report/team-feed.ts): a person
 * or «не проверены» is a step of the browser's history, so «‹ Назад» comes back to the whole feed;
 * the tab is swapped in place, like «Настройки». The native history calls keep Next's
 * `useSearchParams` in step without a round trip to the server.
 */
export function TeamReportsScreen() {
  // a namesake on screen gets the surname's initial once the roster has come (D-146)
  useNamesKey();
  const me = useMe();
  const now = useNow();
  const today = todayYmd(now);
  const params = useSearchParams();
  const address = useMemo(() => readReportsAddress(params), [params]);

  const [kind, setKind] = useState<PeriodKind>("week");
  const [custom, setCustom] = useState<{ from: Ymd; to: Ymd } | null>(null);
  const range = kind === "custom" && custom ? custom : periodOf(kind === "month" ? "month" : "week", today);

  const companyId = me.data?.companyId;
  const director = me.data?.role === "director";
  const filter = useMemo(() => ({ who: address.who, q: "", unchecked: address.unchecked }), [address.who, address.unchecked]);
  const feed = useReportsFeed(filter, companyId, address.tab === "feed");
  const period = useTeamDailyReportPeriod(range.from, range.to, address.tab === "period" && Boolean(companyId));
  const unchecked = useUncheckedReportsCount(companyId, director);

  const go = useCallback(
    (patch: Partial<ReportsAddress>, how: "push" | "replace" = "push") => {
      const href = reportsHref({ ...address, ...patch });
      // a state of our own (null), not Next's: with Next's marks the router skips the sync
      if (how === "push") window.history.pushState(null, "", href);
      else window.history.replaceState(null, "", href);
    },
    [address],
  );

  // the day and its words come from the phone's clock: the server's HTML is the skeleton
  const hydrated = useHydrated();
  if (!hydrated) return <TeamReportsSkeleton tab={address.tab} />;

  return (
    <TeamReportsView
      address={address}
      // a filter or a person is a step back; the tab and the day it opened on are not
      onTab={(tab) => go({ tab, day: null }, "replace")}
      onPerson={(who) => go({ tab: "feed", who, day: null })}
      onUnchecked={(on) => go({ unchecked: on, day: null })}
      today={today}
      now={now}
      companyId={companyId}
      feed={feed}
      uncheckedCount={unchecked}
      periodKind={kind}
      onPeriodKind={(next) => {
        // «Свой» starts from what is on screen, so the first pick moves one end only
        if (next === "custom" && !custom) setCustom(range);
        setKind(next);
      }}
      range={range}
      onRange={setCustom}
      period={period.data}
      periodStale={period.isPlaceholderData}
      periodFailed={period.isError && !period.data}
      onRetryPeriod={() => void period.refetch()}
    />
  );
}
