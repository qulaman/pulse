"use client";

import { useQueryClient } from "@tanstack/react-query";
import { TriangleAlert } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { Button } from "@/components/ui/Button";
import { clashesWith, spanOf } from "@/lib/calendar/agenda";
import { DESK_WORDS, useCreateEvent } from "@/lib/calendar/mutations";
import { calendarKeys, type CalendarEvent } from "@/lib/calendar/queries";
import { humanYmd } from "@/lib/datetime/calendar";

import type { EventSeed } from "./EventForm";
import { PeopleField } from "./PeopleField";
import { hmAt, lengthRu, slotIso, type Slot } from "./slots";

const WIDTH = 360;
/** Between the block and the card. */
const GAP = 10;
/** The window's edge the card keeps clear of. */
const EDGE = 8;
/** `Popover` hangs its panel this far below the point it is given. */
const HANG = 6;
/** What the card is taken to be tall before it has been measured (title, people, buttons). */
const FIRST_HEIGHT = 240;

/** Every meeting the screen has read (the months on screen, the month ahead, one opened by id), once each. */
function cachedMeetings(lists: readonly unknown[]): CalendarEvent[] {
  const byId = new Map<string, CalendarEvent>();
  for (const data of lists) {
    const rows = Array.isArray(data) ? (data as CalendarEvent[]) : data && typeof data === "object" && "id" in data ? [data as CalendarEvent] : [];
    for (const row of rows) if (row && Array.isArray(row.participants)) byId.set(row.id, row);
  }
  return [...byId.values()];
}

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * Where the card stands beside the block (Google Calendar's way, D-180): to its right when there is
 * room, else to its left; its top level with the block's — and lifted only as far as its height
 * needs to fit the window. So it follows the block through a scroll, and when it grows (the people
 * list opens) it moves up by the growth, never flipping over the block. A point for `Popover`.
 */
function beside(rect: DOMRect, height: number): { x: number; y: number } {
  const right = rect.right + GAP;
  const x = right + WIDTH <= window.innerWidth - EDGE ? right : Math.max(EDGE, rect.left - GAP - WIDTH);
  const y = Math.max(EDGE - HANG, Math.min(rect.top - HANG, window.innerHeight - EDGE - height - HANG));
  return { x, y };
}

/**
 * A meeting made with the mouse (wave 3): the stretch clicked or dragged on the week stands as a
 * block, and this card beside it asks only what the grid cannot know — the title and who comes.
 * Enter creates it (the phone's `useCreateEvent`, idempotent by the id the card was opened with);
 * «Подробнее» carries what is typed into the full form; Esc or a click away lets it go. `anchor` is
 * the block itself: the card follows it through the scroll of the page (D-180). When the stretch
 * shares time with one of this person's meetings, the card says which before Enter.
 */
export function QuickCreate({
  slot,
  anchor,
  meId,
  now,
  events,
  onClose,
  onTitle,
  onMore,
  onCreated,
}: {
  slot: Slot | null;
  /** The new meeting's block on the grid (`data-testid="cal-ghost"`). */
  anchor: HTMLElement | null;
  meId: string;
  now: Date;
  /**
   * The meetings to look for a clash in; left out — every meeting the screen has already read
   * (the query cache: no read of its own).
   */
  events?: readonly CalendarEvent[];
  onClose: () => void;
  /** The title as it is typed — the block on the grid shows it. */
  onTitle: (title: string) => void;
  onMore: (seed: EventSeed) => void;
  onCreated: (startsAt: string, id: string | null) => void;
}) {
  const closeList = useRef<(() => boolean) | null>(null);
  const height = useRef(FIRST_HEIGHT);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const open = slot !== null && anchor !== null;

  const place = useCallback(() => {
    if (!anchor || !anchor.isConnected) return;
    const next = beside(anchor.getBoundingClientRect(), height.current);
    setPoint((was) => (was && was.x === next.x && was.y === next.y ? was : next));
  }, [anchor]);

  // placed before it is painted (a point left from the last card is replaced before the first
  // paint); again on every scroll and resize while it is up
  useLayoutEffect(() => {
    if (open) place();
  }, [open, place, slot?.start, slot?.end, slot?.ymd]);
  useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const onHeight = useCallback(
    (next: number) => {
      if (Math.abs(next - height.current) < 1) return;
      height.current = next;
      place();
    },
    [place],
  );

  return (
    <Popover
      open={open && point !== null}
      // Esc and a click away close the open list of people first
      onClose={() => {
        if (closeList.current?.()) return;
        onClose();
      }}
      anchor={point}
      width={WIDTH}
      label="Новая встреча"
      track
    >
      {slot ? (
        <QuickBody
          key={`${slot.ymd}-${slot.start}-${slot.end}`}
          slot={slot}
          meId={meId}
          now={now}
          events={events ?? null}
          onClose={onClose}
          onTitle={onTitle}
          onMore={onMore}
          onCreated={onCreated}
          closeList={closeList}
          onHeight={onHeight}
        />
      ) : null}
    </Popover>
  );
}

function QuickBody({
  slot,
  meId,
  now,
  events,
  onClose,
  onTitle,
  onMore,
  onCreated,
  closeList,
  onHeight,
}: {
  slot: Slot;
  meId: string;
  now: Date;
  events: readonly CalendarEvent[] | null;
  onClose: () => void;
  onTitle: (title: string) => void;
  onMore: (seed: EventSeed) => void;
  onCreated: (startsAt: string, id: string | null) => void;
  closeList: RefObject<(() => boolean) | null>;
  onHeight: (height: number) => void;
}) {
  const create = useCreateEvent(DESK_WORDS);
  const queryClient = useQueryClient();
  // read once for the slot the card was opened on: the card lives seconds, the cache does not move under it
  const [known] = useState(() => events ?? cachedMeetings(queryClient.getQueriesData({ queryKey: calendarKeys.root }).map(([, data]) => data)));
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState<{ ids: string[]; everyone: boolean }>({ ids: [], everyone: false });
  const [tried, setTried] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const form = useRef<HTMLFormElement>(null);

  // the card is placed before it is shown: the caret goes in once it is on screen
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  // its height places it: the panel around the form (its hairline included) is what must fit
  useLayoutEffect(() => {
    const node = form.current;
    if (!node) return;
    const measure = () => onHeight((node.parentElement ?? node).getBoundingClientRect().height);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, [onHeight]);

  const { starts_at, ends_at } = slotIso(slot);
  const clashes = useMemo(() => clashesWith(known, starts_at, ends_at, meId), [known, starts_at, ends_at, meId]);
  const name = title.trim();
  const seed = (): EventSeed => ({ title, day: slot.ymd, start: hmAt(slot.start), end: hmAt(slot.end), ids: people.ids, everyone: people.everyone });

  const save = () => {
    setTried(true);
    if (!name || create.isPending) return;
    create.mutate(
      {
        requestId,
        draft: {
          title: name,
          starts_at,
          ends_at,
          location: null,
          body: null,
          remind_before_min: 30,
          everyone: people.everyone,
          participant_ids: people.everyone ? [] : people.ids,
          repeat: "none",
        },
      },
      {
        onSuccess: (id) => {
          onCreated(starts_at, id);
          onClose();
        },
      },
    );
  };

  return (
    <form
      ref={form}
      className="cal-quick desk-fields flex flex-col gap-3 p-4"
      data-testid="desk-quick-create"
      onSubmit={(submit) => {
        submit.preventDefault();
        save();
      }}
    >
      <div>
        <p className="desk-label uppercase">Новая встреча</p>
        <p className="nums mt-0.5 text-[13px] leading-[18px]">
          {capitalize(humanYmd(slot.ymd, now))} · {hmAt(slot.start)}–{hmAt(slot.end)}
          <span className="text-muted"> · {lengthRu(slot.end - slot.start)}</span>
        </p>
        {clashes.length > 0 ? (
          <p className="cal-clash mt-1.5 flex items-start gap-1.5 text-[12px] leading-4" data-testid="desk-quick-clash">
            <TriangleAlert aria-hidden size={14} className="mt-px shrink-0" />
            <span className="min-w-0 [overflow-wrap:anywhere]">
              Пересекается с «{clashes[0].title}» {spanOf(clashes[0])}
              {clashes.length > 1 ? ` и ещё ${clashes.length - 1}` : ""}
            </span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <input
          ref={field}
          value={title}
          onChange={(change) => {
            setTitle(change.target.value);
            onTitle(change.target.value);
          }}
          maxLength={200}
          placeholder="Название"
          aria-label="Название"
          aria-invalid={tried && !name ? true : undefined}
          data-testid="desk-quick-title"
          className="field h-9 w-full px-0 text-[16px] font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted"
        />
        {tried && !name ? <span className="text-[12px] leading-4 text-danger">Без названия не создать</span> : null}
      </div>
      <PeopleField ids={people.ids} everyone={people.everyone} onChange={setPeople} hideIds={[meId]} closeRef={closeList} placeholder="Пригласить — имя или должность" shown={4} />
      <div className="flex items-center gap-2 pt-1">
        <Button type="button" size="sm" variant="ghost" className="-ml-2" onClick={() => onMore(seed())} data-testid="desk-quick-more">
          Подробнее…
        </Button>
        <span className="ml-auto flex items-center gap-1 text-[12px] text-muted">
          <Kbd>Enter</Kbd>
        </span>
        <Button type="submit" size="sm" loading={create.isPending} disabled={create.isPending} data-testid="desk-quick-save">
          Создать
        </Button>
      </div>
    </form>
  );
}
