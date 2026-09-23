"use client";

import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { CalendarList } from "@/components/calendar/CalendarList";
import { CalendarOnWall } from "@/components/calendar/CalendarOnWall";
import { EventSheet } from "@/components/calendar/EventSheet";
import { CalendarListBone } from "@/components/ui/PageSkeletons";
import { useCalendar, useEvent, type CalendarEvent } from "@/lib/calendar/queries";
import { useNow } from "@/lib/pulse/queries";
import { useIngestStore } from "@/lib/store/ingest";
import { useMe } from "@/lib/tasks/queries";

/**
 * «Календарь» (D-78): the ribbon of the days ahead. There is no «new event» form — the
 * «+» opens the same /confirm card the voice pipeline fills in, because one parser and
 * one screen is the whole point (principle 1). A tap on a row opens the meeting; a push
 * lands here with `?e=<id>` and the meeting opens by itself.
 */
export default function CalendarPage() {
  const me = useMe();
  const now = useNow();
  const calendar = useCalendar();
  const startManualEvent = useIngestStore((state) => state.startManualEvent);

  const params = useSearchParams();
  const deepLink = params.get("e");
  const [openId, setOpenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const meId = me.data?.userId ?? "";
  const isDirector = me.data?.role === "director";
  const events = useMemo(() => calendar.data ?? [], [calendar.data]);

  // the deep link opens the meeting from the list, or fetches the one that lies past it
  const wantedId = openId ?? (dismissed ? null : deepLink);
  const fromList = useMemo(() => events.find((event) => event.id === wantedId) ?? null, [events, wantedId]);
  const fetched = useEvent(wantedId && !fromList ? wantedId : null);
  const open: CalendarEvent | null = fromList ?? fetched.data ?? null;

  const closeSheet = () => {
    setOpenId(null);
    setDismissed(true);
  };

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 py-6">
      <div className="flex items-start gap-1">
        <h1 className="mr-auto text-[24px] font-bold leading-[30px]">Календарь</h1>
        {/* the week on the office wall, one tap (D-96) */}
        {isDirector ? <CalendarOnWall /> : null}
        {isDirector ? (
          <button
            type="button"
            aria-label="Новое мероприятие"
            onClick={() => startManualEvent()}
            className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] text-[24px] leading-none text-accent active:bg-surface-2"
          >
            +
          </button>
        ) : null}
      </div>

      {calendar.isLoading ? <CalendarListBone /> : null}

      {!calendar.isLoading && events.length === 0 ? (
        <div className="mt-10 flex flex-col items-center gap-3 text-center">
          <Mascot state="sleeping" size={72} />
          <p className="text-[16px] leading-[22px] text-muted">
            {isDirector
              ? "Скажи маскоту: «планёрка завтра в 10 со всеми» — или нажми +"
              : "Пока ничего не запланировано"}
          </p>
        </div>
      ) : null}

      <CalendarList events={events} now={now} meId={meId} onOpen={(event) => setOpenId(event.id)} />

      <EventSheet event={open} onClose={closeSheet} meId={meId} isDirector={Boolean(isDirector)} />
    </main>
  );
}
