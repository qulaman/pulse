"use client";

import { useState } from "react";

import { PeoplePicker } from "@/components/people/PeoplePicker";
import { useRoster } from "@/lib/people/roster";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Clock } from "@/components/ui/datetime/Clock";
import { DateField } from "@/components/ui/datetime/DateField";
import { ClockIcon, PickerPanel, PickerTrigger, useDismiss } from "@/components/ui/datetime/PickerShell";
import { Row, RowGroup } from "@/components/ui/Row";
import { Sheet } from "@/components/ui/Sheet";
import { defaultStartHm, endIsBeforeStart, shiftEnd } from "@/lib/calendar/agenda";
import { useCreateEvent, useEditEvent, type EventDraft } from "@/lib/calendar/mutations";
import type { CalendarEvent } from "@/lib/calendar/queries";
import { aqtobeIsoToYmdHm, todayYmd, ymdHmToAqtobeIso, type Hm, type Ymd } from "@/lib/datetime/calendar";

type Props = {
  open: boolean;
  onClose: () => void;
  /** The meeting to change; null — a new one on `day`. */
  event: CalendarEvent | null;
  /** The day a new meeting lands on — the one chosen in the grid. */
  day?: Ymd;
  meId: string;
  now?: Date;
  /** The server has the meeting — with its start as saved (the month may follow it) and, for a new one, its id. */
  onSaved?: (startsAt: string, id?: string | null) => void;
};

const REMIND: { min: number; label: string }[] = [
  { min: 10, label: "за 10 мин" },
  { min: 30, label: "за 30 мин" },
  { min: 60, label: "за час" },
  { min: 1440, label: "за день" },
];

const LABEL = "text-[14px] font-medium leading-[18px] text-muted";
const FIELD = "min-h-[44px] w-full field px-3 text-[16px] leading-[22px]";

/**
 * The one form of a meeting (D-94): «+» opens it empty on the chosen day, «Изменить»
 * opens it filled. Everything a meeting has is here — what, when, where, who, the
 * reminder and the agenda — and «Сохранить» sends it whole, as one command.
 */
export function EventEditor({ open, onClose, event, day, meId, now, onSaved }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title={event ? "Изменить мероприятие" : "Новое мероприятие"}>
      {/* born with the sheet: every opening starts from the meeting as it is right now */}
      <EditorBody event={event} day={day} meId={meId} now={now} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function EditorBody({ event, day, meId, now: nowProp, onClose, onSaved }: Omit<Props, "open">) {
  const create = useCreateEvent();
  const edit = useEditEvent();
  const roster = useRoster();

  const [now] = useState(() => nowProp ?? new Date());
  const startsAt = event ? aqtobeIsoToYmdHm(event.starts_at) : null;
  const endsAt = event?.ends_at ? aqtobeIsoToYmdHm(event.ends_at) : null;
  const firstDay = startsAt?.ymd ?? day ?? todayYmd(now);
  const authorId = event?.author_id ?? meId;

  // opened once, sent once: a double tap or a retry is the same meeting (confirm_voice_batch)
  const [requestId] = useState(() => crypto.randomUUID());
  const [title, setTitle] = useState(event?.title ?? "");
  const [ymd, setYmd] = useState<Ymd>(firstDay);
  const [start, setStart] = useState<Hm>(startsAt?.hm ?? defaultStartHm(firstDay, now));
  const [end, setEnd] = useState<Hm | null>(endsAt?.hm ?? null);
  const [location, setLocation] = useState(event?.location ?? "");
  const [body, setBody] = useState(event?.body ?? "");
  const [remind, setRemind] = useState(event?.remind_before_min ?? 30);
  const [everyone, setEveryone] = useState(event?.everyone ?? false);
  const [ids, setIds] = useState<string[]>(() =>
    (event?.participants ?? []).map((person) => person.user_id).filter((id) => id !== authorId),
  );
  const [whoOpen, setWhoOpen] = useState(false);
  const [tried, setTried] = useState(false);

  const busy = create.isPending || edit.isPending;
  const name = title.trim();
  const badEnd = endIsBeforeStart(start, end);

  // a meeting said by voice may carry an offset the chips do not have — it keeps its own chip
  const reminders = REMIND.some((option) => option.min === remind)
    ? REMIND
    : [...REMIND, { min: remind, label: `за ${remind} мин` }].sort((a, b) => a.min - b.min);

  const who = (() => {
    if (everyone) return "Все сотрудники";
    if (ids.length === 0) return "Только вы";
    const names = ids.map(
      (id) => roster.data?.find((person) => person.id === id)?.full_name.split(" ")[0] ?? "…",
    );
    return names.length > 2 ? `${names.slice(0, 2).join(", ")} +${names.length - 2}` : names.join(", ");
  })();

  const save = () => {
    setTried(true);
    if (!name || badEnd || busy) return;
    const draft: EventDraft = {
      title: name,
      starts_at: ymdHmToAqtobeIso(ymd, start)!,
      ends_at: end ? ymdHmToAqtobeIso(ymd, end) : null,
      location: location.trim() || null,
      body: body.trim() || null,
      remind_before_min: remind,
      everyone,
      participant_ids: everyone ? [] : ids,
    };
    // the form stays up until the server has it: a failure leaves every word in place
    const done = (id?: string | null) => {
      onSaved?.(draft.starts_at, id);
      onClose();
    };
    if (event) edit.mutate({ eventId: event.id, draft }, { onSuccess: () => done(event.id) });
    else create.mutate({ requestId, draft }, { onSuccess: (id) => done(id) });
  };

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Что</span>
        <input
          className={`${FIELD} font-display text-[17px] font-semibold placeholder:font-normal`}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder="Планёрка, встреча с клиентом…"
          enterKeyHint="done"
          data-autofocus={event ? undefined : ""}
        />
        {tried && !name ? (
          <span className="text-[13px] leading-4 text-danger">Без названия не сохранить</span>
        ) : null}
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Когда</span>
        <DateField
          value={ymd}
          onChange={setYmd}
          // a new meeting lies ahead; an old one may be corrected where it is
          min={event ? null : todayYmd(now)}
          now={now}
        />
        <TimePair
          start={start}
          end={end}
          onStart={(hm) => {
            setEnd(shiftEnd(start, end, hm));
            setStart(hm);
          }}
          onEnd={setEnd}
        />
        {badEnd ? <span className="text-[13px] leading-4 text-danger">Конец раньше начала</span> : null}
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Где</span>
        <input
          className={FIELD}
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          maxLength={200}
          placeholder="Офис, переговорка, адрес"
          enterKeyHint="done"
        />
      </label>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Кто</span>
        <RowGroup>
          <Row icon={<PeopleIcon />} title="Участники" value={who} onClick={() => setWhoOpen(true)} />
        </RowGroup>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>Напомнить</span>
        <div className="flex flex-wrap gap-2">
          {reminders.map((option) => (
            <Chip
              key={option.min}
              tone={option.min === remind ? "accent" : "neutral"}
              aria-pressed={option.min === remind}
              onClick={() => setRemind(option.min)}
            >
              {option.label}
            </Chip>
          ))}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className={LABEL}>Описание</span>
        <textarea
          className="field w-full px-3 py-2.5 text-[16px] leading-[22px]"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          placeholder="Повестка, что взять с собой"
        />
      </label>

      {/* the button rides the bottom of the sheet: a long form never hides where it ends */}
      <div
        className="sticky bottom-0 z-[1] -mx-4 -mb-1 px-4 pb-1 pt-3"
        style={{ background: "linear-gradient(180deg, transparent, var(--surface) 30%)" }}
      >
        <Button block size="lg" loading={busy} disabled={busy} onClick={save} data-testid="event-save">
          {event ? "Сохранить" : "Создать"}
        </Button>
      </div>

      <PeoplePicker
        mode="many"
        open={whoOpen}
        onClose={() => setWhoOpen(false)}
        title="Кто участвует?"
        subject={name || null}
        allowEveryone
        everyone={everyone}
        selectedIds={ids}
        hideIds={[authorId]}
        onDone={(next) => {
          setEveryone(next.everyone);
          setIds(next.ids);
        }}
      />
    </div>
  );
}

/**
 * Start and end side by side, one clock under both at full width — the pair a meeting's
 * time is made of. The end is optional: «Без конца» takes it back off.
 */
function TimePair({
  start,
  end,
  onStart,
  onEnd,
}: {
  start: Hm;
  end: Hm | null;
  onStart: (hm: Hm) => void;
  onEnd: (hm: Hm | null) => void;
}) {
  const [open, setOpen] = useState<"start" | "end" | null>(null);
  const box = useDismiss(open !== null, () => setOpen(null));
  const toggle = (which: "start" | "end") => setOpen((was) => (was === which ? null : which));
  // the hour keeps the clock open, the minute closes it — as in TimeField
  const sameHour = (a: Hm | null, b: Hm) => Boolean(a && a.slice(0, 2) === b.slice(0, 2));

  return (
    <div ref={box}>
      <div className="grid grid-cols-2 gap-2">
        <PickerTrigger
          open={open === "start"}
          onClick={() => toggle("start")}
          label="Начало"
          placeholder="Начало"
          value={start}
          icon={<ClockIcon />}
        />
        <PickerTrigger
          open={open === "end"}
          onClick={() => toggle("end")}
          label="Конец"
          placeholder="Конец"
          value={end ? `до ${end}` : null}
          icon={<ClockIcon />}
        />
      </div>

      {open === "start" ? (
        <PickerPanel>
          <Clock
            value={start}
            onPick={(hm) => {
              onStart(hm);
              if (sameHour(start, hm)) setOpen(null);
            }}
          />
        </PickerPanel>
      ) : null}

      {open === "end" ? (
        <PickerPanel>
          <Clock
            value={end}
            onPick={(hm) => {
              onEnd(hm);
              if (sameHour(end, hm)) setOpen(null);
            }}
          />
          {end ? (
            <button
              type="button"
              onClick={() => {
                onEnd(null);
                setOpen(null);
              }}
              className="mt-2 min-h-[44px] w-full rounded-[12px] text-[15px] leading-5 text-muted active:bg-surface-2"
            >
              Без конца
            </button>
          ) : null}
        </PickerPanel>
      ) : null}
    </div>
  );
}

function PeopleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" />
      <path d="M16 6.2a3 3 0 0 1 0 5.6M17.5 14.4c2 .7 3 2.4 3 4.6" />
    </svg>
  );
}
