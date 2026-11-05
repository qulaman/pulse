"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

import { Dialog } from "@/components/desk/ui/Dialog";
import { Kbd } from "@/components/desk/ui/Kbd";
import { Popover } from "@/components/desk/ui/Popover";
import { Select } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Calendar } from "@/components/ui/datetime/Calendar";
import { defaultStartHm, endIsBeforeStart } from "@/lib/calendar/agenda";
import { useCreateEvent, useEditEvent, type EventDraft } from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { aqtobeIsoToYmdHm, humanYmd, parseYmd, todayYmd, ymdHmToAqtobeIso, type Hm, type Ymd } from "@/lib/datetime/calendar";
import { EVENT_REPEAT_LABEL, EVENT_REPEATS, type EventRepeat } from "@/lib/recurrence/schedule";

import { PeopleField } from "./PeopleField";
import { endTimes, hmAt, minutesOfHm, startTimes, withOwn } from "./slots";

/** What a new meeting starts with when the grid or the quick card already knows some of it. */
export type EventSeed = {
  title?: string;
  day: Ymd;
  start?: Hm;
  end?: Hm | null;
  ids?: string[];
  everyone?: boolean;
};

const REMIND: { min: number; label: string }[] = [
  { min: 10, label: "за 10 минут" },
  { min: 30, label: "за 30 минут" },
  { min: 60, label: "за час" },
  { min: 1440, label: "за день" },
];

const LABEL = "desk-label uppercase";
const INPUT = "field h-9 w-full px-3 text-[14px] leading-5 outline-none placeholder:text-muted";
const WEEKDAY = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

/** «вт, 4 ноября» — the day on its button. */
function dayLabel(ymd: Ymd): string {
  const parts = parseYmd(ymd);
  if (!parts) return ymd;
  return WEEKDAY.format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
}

/**
 * The desk's form of a meeting (wave 3): one dialog, laid out for a mouse and a keyboard — the
 * title, the day from a calendar under its button, the start and the end from lists of quarters
 * (the end says how long it makes the meeting), the place, the people as chips with a search,
 * the series and the reminder from lists, the agenda. Ctrl+Enter or Enter in the title saves;
 * Esc closes the open list first, then the form. Every write is the phone's own: `useCreateEvent`
 * (idempotent by the id the form was opened with) or `useEditEvent`.
 */
export function EventForm({
  open,
  onClose,
  event,
  seed,
  meId,
  now,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The meeting to change; null — a new one from `seed`. */
  event: CalendarEvent | null;
  seed: EventSeed | null;
  meId: string;
  now: Date;
  /** The server has it — with its start as saved and, for a new one, its id. */
  onSaved: (startsAt: string, id: string | null) => void;
}) {
  const closeList = useRef<(() => boolean) | null>(null);
  const closeDay = useRef<(() => boolean) | null>(null);
  // Esc reaches the dialog first (its listener is the window's): an open list or calendar closes instead
  const close = () => {
    if (closeList.current?.() || closeDay.current?.()) return;
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title={event ? "Изменить встречу" : "Новая встреча"} width="md">
      {open ? <FormBody key={event?.id ?? "new"} event={event} seed={seed} meId={meId} now={now} onClose={onClose} onSaved={onSaved} closeList={closeList} closeDay={closeDay} /> : null}
    </Dialog>
  );
}

function FormBody({
  event,
  seed,
  meId,
  now: nowProp,
  onClose,
  onSaved,
  closeList,
  closeDay,
}: {
  event: CalendarEvent | null;
  seed: EventSeed | null;
  meId: string;
  now: Date;
  onClose: () => void;
  onSaved: (startsAt: string, id: string | null) => void;
  closeList: RefObject<(() => boolean) | null>;
  closeDay: RefObject<(() => boolean) | null>;
}) {
  const create = useCreateEvent();
  const edit = useEditEvent();
  const [now] = useState(nowProp);
  const startsAt = event ? aqtobeIsoToYmdHm(event.starts_at) : null;
  const endsAt = event?.ends_at ? aqtobeIsoToYmdHm(event.ends_at) : null;
  const firstDay = startsAt?.ymd ?? seed?.day ?? todayYmd(now);
  const authorId = event?.author_id ?? meId;

  // opened once, sent once: a double press or a retry is the same meeting (confirm_voice_batch)
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(event?.title ?? seed?.title ?? "");
  const [ymd, setYmd] = useState<Ymd>(firstDay);
  const [start, setStart] = useState<Hm>(startsAt?.hm ?? seed?.start ?? defaultStartHm(firstDay, now));
  const [end, setEnd] = useState<Hm | null>(event ? (endsAt?.hm ?? null) : seed?.end !== undefined ? seed.end : hmAt(Math.min(24 * 60 - 1, minutesOfHm(seed?.start ?? defaultStartHm(firstDay, now)) + 60)));
  const [location, setLocation] = useState(event?.location ?? "");
  const [body, setBody] = useState(event?.body ?? "");
  const [remind, setRemind] = useState(event?.remind_before_min ?? 30);
  const [repeat, setRepeat] = useState<EventRepeat>("none");
  const [people, setPeople] = useState<{ ids: string[]; everyone: boolean }>(() => ({
    ids: event ? event.participants.map((person) => person.user_id).filter((id) => id !== authorId) : (seed?.ids ?? []),
    everyone: event?.everyone ?? seed?.everyone ?? false,
  }));
  const [tried, setTried] = useState(false);

  const busy = create.isPending || edit.isPending;
  const name = title.trim();
  const badEnd = endIsBeforeStart(start, end);
  const reminders = REMIND.some((option) => option.min === remind) ? REMIND : [...REMIND, { min: remind, label: `за ${remind} мин` }].sort((a, b) => a.min - b.min);
  const past = !event && ymd < todayYmd(now);

  const pickStart = (next: Hm) => {
    // a moved start takes the end along: the meeting keeps its length while it fits the day
    if (end) {
      const length = minutesOfHm(end) - minutesOfHm(start);
      const moved = minutesOfHm(next) + Math.max(15, length);
      setEnd(moved < 24 * 60 ? hmAt(moved) : null);
    }
    setStart(next);
  };

  const save = () => {
    setTried(true);
    if (!name || badEnd || busy || past) return;
    const draft: EventDraft = {
      title: name,
      starts_at: ymdHmToAqtobeIso(ymd, start)!,
      ends_at: end ? ymdHmToAqtobeIso(ymd, end) : null,
      location: location.trim() || null,
      body: body.trim() || null,
      remind_before_min: remind,
      everyone: people.everyone,
      participant_ids: people.everyone ? [] : people.ids,
      repeat: event ? "none" : repeat,
    };
    // the form stays up until the server has it: a failure leaves every word in place
    const done = (id: string | null) => {
      onSaved(draft.starts_at, id);
      onClose();
    };
    if (event) edit.mutate({ eventId: event.id, draft }, { onSuccess: () => done(event.id) });
    else create.mutate({ requestId, draft }, { onSuccess: (id) => done(id) });
  };

  return (
    <form
      className="desk-fields flex flex-col gap-3"
      data-testid="desk-event-form"
      onSubmit={(submit) => {
        submit.preventDefault();
        save();
      }}
      onKeyDown={(key) => {
        if ((key.ctrlKey || key.metaKey) && (key.code === "Enter" || key.code === "NumpadEnter")) {
          key.preventDefault();
          save();
        }
      }}
    >
      <div className="flex flex-col gap-1">
        <input
          data-autofocus
          value={title}
          onChange={(change) => setTitle(change.target.value)}
          maxLength={200}
          placeholder="Название — планёрка, встреча с клиентом…"
          aria-label="Название"
          data-testid="desk-event-title"
          className="field h-10 w-full px-0 text-[17px] font-semibold leading-6 outline-none placeholder:font-normal placeholder:text-muted"
        />
        {tried && !name ? <span className="text-[12px] leading-4 text-danger">Без названия не сохранить</span> : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_112px_minmax(0,176px)] items-end gap-2">
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className={LABEL}>Когда</span>
          <DayButton value={ymd} onChange={setYmd} min={event ? null : todayYmd(now)} now={now} closeRef={closeDay} />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Начало</span>
          <Select value={start} onChange={(change) => pickStart(change.target.value)} aria-label="Начало" className="nums w-full">
            {withOwn(startTimes(), start).map((hm) => (
              <option key={hm} value={hm}>
                {hm}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Конец</span>
          <Select value={end ?? ""} onChange={(change) => setEnd(change.target.value || null)} aria-label="Конец" className="nums w-full">
            <option value="">Без конца</option>
            {endTimes(start)
              .concat(end && !endTimes(start).some((option) => option.hm === end) ? [{ hm: end, label: end }] : [])
              .map((option) => (
                <option key={option.hm} value={option.hm}>
                  {option.label}
                </option>
              ))}
          </Select>
        </label>
      </div>
      {badEnd ? <span className="-mt-2 text-[12px] leading-4 text-danger">Конец раньше начала</span> : null}
      {past ? <span className="-mt-2 text-[12px] leading-4 text-danger">Новая встреча — на сегодня или позже</span> : null}

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Где</span>
        <input value={location} onChange={(change) => setLocation(change.target.value)} maxLength={200} placeholder="Офис, переговорная, адрес" className={INPUT} />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Кто</span>
        <PeopleField ids={people.ids} everyone={people.everyone} onChange={setPeople} hideIds={[authorId]} closeRef={closeList} testId="desk-event-people" />
        {people.ids.length === 0 && !people.everyone ? <span className="text-[12px] leading-4 text-muted">Пока только вы — пригласите людей, им придёт уведомление</span> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        {event ? null : (
          <label className="flex flex-col gap-1.5">
            <span className={LABEL}>Повторять</span>
            <Select value={repeat} onChange={(change) => setRepeat(change.target.value as EventRepeat)} aria-label="Повторять" className="w-full">
              {EVENT_REPEATS.map((option) => (
                <option key={option} value={option}>
                  {EVENT_REPEAT_LABEL[option]}
                </option>
              ))}
            </Select>
          </label>
        )}
        <label className="flex flex-col gap-1.5">
          <span className={LABEL}>Напомнить</span>
          <Select value={remind} onChange={(change) => setRemind(Number(change.target.value))} aria-label="Напомнить" className="w-full">
            {reminders.map((option) => (
              <option key={option.min} value={option.min}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Повестка</span>
        <textarea
          value={body}
          onChange={(change) => setBody(change.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Что обсудить, что взять с собой"
          className="field w-full resize-none px-3 py-2 text-[14px] leading-5 outline-none placeholder:text-muted"
        />
      </label>

      <div className="flex items-center gap-2 pt-2">
        <span className="flex items-center gap-1 text-[12px] leading-4 text-muted">
          <Kbd>Ctrl</Kbd>
          <Kbd>Enter</Kbd>
          <span className="ml-1">{event ? "сохранить" : "создать"}</span>
        </span>
        <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
          Отмена
        </Button>
        <Button type="submit" size="sm" loading={busy} disabled={busy} data-testid="desk-event-save">
          {event ? "Сохранить" : "Создать"}
        </Button>
      </div>
    </form>
  );
}

/** The day of a meeting: a button with the day on it, our calendar under it. */
function DayButton({ value, onChange, min, now, closeRef }: { value: Ymd; onChange: (ymd: Ymd) => void; min: Ymd | null; now: Date; closeRef: RefObject<(() => boolean) | null> }) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  // the form's Esc closes the calendar first
  useLayoutEffect(() => {
    closeRef.current = () => {
      if (!anchor) return false;
      setAnchor(null);
      return true;
    };
  });
  const today = todayYmd(now);
  const human = humanYmd(value, now);
  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={Boolean(anchor)}
        onClick={(click) => setAnchor(anchor ? null : click.currentTarget)}
        className="field flex h-9 w-full items-center gap-2 px-3 text-left text-[14px] leading-5"
        data-testid="desk-event-day"
      >
        <span className="min-w-0 flex-1 truncate">
          {dayLabel(value)}
          {value === today || human === "завтра" ? <span className="text-muted"> · {human}</span> : null}
        </span>
      </button>
      <Popover open={Boolean(anchor)} onClose={() => setAnchor(null)} anchor={anchor} width={300} label="Выбрать день">
        <div className="p-2">
          <Calendar
            value={value}
            min={min}
            now={now}
            onPick={(ymd) => {
              onChange(ymd);
              setAnchor(null);
            }}
          />
        </div>
      </Popover>
    </>
  );
}
