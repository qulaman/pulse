"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { CalendarOnWall } from "@/components/calendar/CalendarOnWall";
import { CalendarView } from "@/components/calendar/CalendarView";
import { useCalendarNav } from "@/components/calendar/useCalendarNav";
import { useCalendar, useCalendarMonth, useEvent } from "@/lib/calendar/queries";
import { useNow } from "@/lib/pulse/queries";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Календарь» (D-78, D-94): the data behind `CalendarView` — the month on screen, the days
 * ahead for the status screen, who is looking. A push lands here with `?e=<id>`: the grid
 * turns to that meeting's day and its card opens by itself.
 */
export default function CalendarPage() {
  const me = useMe();
  const now = useNow();
  const nav = useCalendarNav();
  const month = useCalendarMonth(nav.month);
  const upcoming = useCalendar();
  const [openId, setOpenId] = useState<string | null>(null);

  // the deep link: fetched by id (it may lie past the loaded months), followed once
  const deepLink = useSearchParams().get("e");
  const [linkDone, setLinkDone] = useState<string | null>(null);
  const linked = useEvent(deepLink && linkDone !== deepLink ? deepLink : null);
  if (deepLink && linkDone !== deepLink && linked.isSuccess) {
    setLinkDone(deepLink);
    // a meeting deleted since the push simply is not there
    if (linked.data) {
      nav.follow(linked.data.starts_at);
      setOpenId(deepLink);
    }
  }

  const events = useMemo(() => month.data ?? [], [month.data]);
  const ahead = useMemo(() => upcoming.data ?? [], [upcoming.data]);
  const isDirector = me.data?.role === "director";

  return (
    <CalendarView
      nav={nav}
      now={now}
      meId={me.data?.userId ?? ""}
      isDirector={isDirector}
      upcoming={ahead}
      events={events}
      loading={month.isLoading}
      openId={openId}
      onOpenId={setOpenId}
      // the week on the office wall, one tap (D-96)
      headExtra={isDirector ? <CalendarOnWall /> : null}
    />
  );
}
