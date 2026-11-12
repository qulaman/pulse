"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { Button } from "@/components/ui/Button";
import { useCreateEvent } from "@/lib/calendar/mutations";
import { humanYmd } from "@/lib/datetime/calendar";

import type { EventSeed } from "./EventForm";
import { PeopleField } from "./PeopleField";
import { hmAt, lengthRu, slotIso, type Slot } from "./slots";

const WIDTH = 360;

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * A meeting made with the mouse (wave 3): the stretch clicked or dragged on the week stands as a
 * block, and this card beside it asks only what the grid cannot know — the title and who comes.
 * Enter creates it (the phone's `useCreateEvent`, idempotent by the id the card was opened with);
 * «Подробнее» carries what is typed into the full form; Esc or a click away lets it go.
 */
export function QuickCreate({
  slot,
  anchor,
  meId,
  now,
  onClose,
  onTitle,
  onMore,
  onCreated,
}: {
  slot: Slot | null;
  anchor: { x: number; y: number } | null;
  meId: string;
  now: Date;
  onClose: () => void;
  /** The title as it is typed — the block on the grid shows it. */
  onTitle: (title: string) => void;
  onMore: (seed: EventSeed) => void;
  onCreated: (startsAt: string, id: string | null) => void;
}) {
  const closeList = useRef<(() => boolean) | null>(null);
  return (
    <Popover
      open={slot !== null && anchor !== null}
      // Esc and a click away close the open list of people first
      onClose={() => {
        if (closeList.current?.()) return;
        onClose();
      }}
      anchor={anchor}
      width={WIDTH}
      label="Новая встреча"
    >
      {slot ? <QuickBody key={`${slot.ymd}-${slot.start}-${slot.end}`} slot={slot} meId={meId} now={now} onClose={onClose} onTitle={onTitle} onMore={onMore} onCreated={onCreated} closeList={closeList} /> : null}
    </Popover>
  );
}

function QuickBody({
  slot,
  meId,
  now,
  onClose,
  onTitle,
  onMore,
  onCreated,
  closeList,
}: {
  slot: Slot;
  meId: string;
  now: Date;
  onClose: () => void;
  onTitle: (title: string) => void;
  onMore: (seed: EventSeed) => void;
  onCreated: (startsAt: string, id: string | null) => void;
  closeList: RefObject<(() => boolean) | null>;
}) {
  const create = useCreateEvent();
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState("");
  const [people, setPeople] = useState<{ ids: string[]; everyone: boolean }>({ ids: [], everyone: false });
  const [tried, setTried] = useState(false);
  const field = useRef<HTMLInputElement>(null);

  // the card is placed before it is shown: the caret goes in once it is on screen
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.focus({ preventScroll: true }));
    return () => cancelAnimationFrame(frame);
  }, []);

  const name = title.trim();
  const seed = (): EventSeed => ({ title, day: slot.ymd, start: hmAt(slot.start), end: hmAt(slot.end), ids: people.ids, everyone: people.everyone });

  const save = () => {
    setTried(true);
    if (!name || create.isPending) return;
    const { starts_at, ends_at } = slotIso(slot);
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
          data-testid="desk-quick-title"
          className="field h-9 w-full px-0 text-[15px] font-semibold leading-5 outline-none placeholder:font-normal placeholder:text-muted"
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
