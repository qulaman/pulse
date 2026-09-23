"use client";

import { useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";

import { CalendarView } from "@/components/calendar/CalendarView";
import { useCalendarNav } from "@/components/calendar/useCalendarNav";
import { CalendarSkeleton } from "@/components/ui/PageSkeletons";

import { buildEvents, buildMany, DIRECTOR, MARAT, ROSTER, visibleTo } from "./fixtures";

/**
 * The real /calendar view on fixtures (D-100). Reading and opening work as in the app; a
 * button that writes (Буду, Сохранить, Удалить) calls the real mutation with a fixture id,
 * which the server refuses — nothing reaches anybody's calendar or phone.
 */
export function Sandbox({ role, empty, bones, many }: { role: "director" | "employee"; empty: boolean; bones: boolean; many: boolean }) {
  const queryClient = useQueryClient();
  // the form's «Участники» reads the roster; seeded, it never asks the server
  useState(() => queryClient.setQueryData(["roster"], ROSTER));

  const now = useMemo(() => new Date(), []);
  const nav = useCalendarNav();
  const [openId, setOpenId] = useState<string | null>(null);
  const meId = role === "director" ? DIRECTOR : MARAT;
  const events = useMemo(
    () => (empty ? [] : visibleTo(many ? buildMany(now) : buildEvents(now), meId)),
    [empty, many, now, meId],
  );

  return (
    <div className="app-shell flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex flex-wrap gap-x-4 gap-y-1 border-b border-border/80 bg-bg px-4 py-2 text-[14px]">
        <span className="font-semibold text-accent">/dev/calendar</span>
        <Link href="/dev/calendar?role=director" className={role === "director" && !empty ? "text-text" : "text-muted"}>
          Директор
        </Link>
        <Link href="/dev/calendar?role=employee" className={role === "employee" ? "text-text" : "text-muted"}>
          Сотрудник
        </Link>
        <Link href="/dev/calendar?role=director&empty=1" className={empty ? "text-text" : "text-muted"}>
          Пусто
        </Link>
      </header>
      {/* ?bones=1 — the skeleton in the same frame, to hold it against the screen */}
      {bones ? <CalendarSkeleton /> : null}
      <CalendarView
        nav={nav}
        now={now}
        meId={meId}
        isDirector={role === "director"}
        upcoming={events}
        events={events}
        loading={false}
        openId={openId}
        onOpenId={setOpenId}
      />
    </div>
  );
}
