"use client";

import { Suspense } from "react";

import { TodayScreen, TodaySkeleton } from "@/components/desk/today/TodayScreen";

/** «Сегодня» (D-154): the director's home on the desk — the moment, the decisions, the team, the day. Reads `?id`. */
export default function Page() {
  return (
    <Suspense fallback={<TodaySkeleton />}>
      <TodayScreen />
    </Suspense>
  );
}
