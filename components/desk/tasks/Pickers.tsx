"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { Avatar } from "@/components/desk/ui/PersonCell";
import { humanAqtobe } from "@/lib/ai/time";
import { addMonths, aqtobeIsoToYmdHm, monthMatrix, monthOf, monthTitleRu, WEEKDAYS_SHORT_RU, type Month } from "@/lib/datetime/calendar";
import { deadlinePresets, parseTimeInput, shiftYmd, stepHm, wallIso, wallYmd } from "@/lib/desk/tasks";
import { useTeamLoads } from "@/lib/people/loads";
import { shortName } from "@/lib/people/names";
import { searchPeople, useRoster, type RosterEntry } from "@/lib/people/roster";
import { pluralRu } from "@/lib/tasks/status-text";

/**
 * The desk's own pickers (D-154 wave 3) — the bodies of a `Popover` that hangs from the field or
 * the button that asked: a deadline (quick choices under digits, a month under the arrows, a time
 * box) and a person (search under the caret, ↑/↓, Enter). The phone's sheets ask the same in its
 * own way; the answers go to the same actions.
 */

/** A picker takes the caret when it opens and gives it back where it was when it goes. */
function useOwnFocus<T extends HTMLElement>(): RefObject<T | null> {
  const box = useRef<T>(null);
  useLayoutEffect(() => {
    const own = box.current;
    const before = document.activeElement as HTMLElement | null;
    const first = own?.querySelector<HTMLElement>("[data-autofocus]") ?? own;
    // the popover is placed (and made visible) by its own effect after this one: a hidden box takes no caret yet
    const frame = requestAnimationFrame(() => first?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      // only when the caret is still ours (or nowhere): a click elsewhere keeps its own focus
      const now = document.activeElement;
      if (before && (!now || now === document.body || own?.contains(now))) before.focus?.({ preventScroll: true });
    };
  }, []);
  return box;
}

function PickerHead({ title, hint, children }: { title: string; hint?: ReactNode; children?: ReactNode }) {
  return (
    <div className="border-b border-border/70 px-3 pb-2 pt-2.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-[12px] font-semibold uppercase leading-4 tracking-[0.06em] text-muted">{title}</p>
        {children}
      </div>
      {hint ? <p className="mt-1 text-[12px] leading-4 text-muted">{hint}</p> : null}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A deadline                                                                  */
/* -------------------------------------------------------------------------- */

const DAY_LONG = new Intl.DateTimeFormat("ru-RU", { weekday: "short", day: "numeric", month: "long", timeZone: "UTC" });

function dayWords(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return DAY_LONG.format(new Date(Date.UTC(y, m - 1, d)));
}

/**
 * «Срок» on the desk: the quick choices (1…6), a month (←/→ a day, ↑/↓ a week, PageUp/PageDown a
 * month), the time (typed as «930» or «18.30», ↑/↓ a quarter of an hour) and Enter. `none` — «Без
 * срока» is a choice (a new person after a pass always gets a date, D-128).
 */
export function DeadlinePicker({
  title,
  hint,
  currentIso,
  now,
  none = true,
  onPick,
}: {
  title: string;
  hint?: ReactNode;
  currentIso: string | null;
  now: Date;
  none?: boolean;
  onPick: (iso: string | null) => void;
}) {
  const start = aqtobeIsoToYmdHm(currentIso);
  const today = wallYmd(now);
  const [ymd, setYmd] = useState<string | null>(start?.ymd ?? null);
  const [time, setTime] = useState(start?.hm ?? "18:00");
  const [month, setMonth] = useState<Month>(() => monthOf(start?.ymd ?? today, now));
  const box = useOwnFocus<HTMLDivElement>();
  const presets = deadlinePresets(now, { none });
  const hm = parseTimeInput(time);
  const chosen = ymd && hm ? wallIso(ymd, hm) : null;
  const past = chosen ? new Date(chosen).getTime() <= now.getTime() : false;
  const same = chosen !== null && currentIso !== null && new Date(chosen).getTime() === new Date(currentIso).getTime();
  const ready = Boolean(chosen) && !past && !same;

  const choose = (next: string) => {
    if (next < today) return;
    setYmd(next);
    setMonth(monthOf(next, now));
  };
  const apply = () => {
    if (ready && chosen) onPick(chosen);
  };

  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const typing = (event.target as HTMLElement).tagName === "INPUT";
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    if (!typing && /^Digit[1-9]$/.test(event.code)) {
      const preset = presets[Number(event.code.slice(5)) - 1];
      if (!preset) return;
      event.preventDefault();
      onPick(preset.iso);
      return;
    }
    if (event.code === "Enter" || event.code === "NumpadEnter") {
      if ((event.target as HTMLElement).tagName === "BUTTON") return;
      event.preventDefault();
      apply();
      return;
    }
    if (typing) return;
    const step: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.code in step) {
      event.preventDefault();
      const next = shiftYmd(ymd ?? today, ymd ? step[event.code] : 0);
      choose(next < today ? today : next);
    } else if (event.code === "PageUp" || event.code === "PageDown") {
      event.preventDefault();
      setMonth((was) => addMonths(was, event.code === "PageUp" ? -1 : 1));
    }
  };

  const grid = monthMatrix(month);
  return (
    <div ref={box} tabIndex={-1} onKeyDown={onKey} className="outline-none" data-testid="desk-deadline-picker">
      <PickerHead title={title} hint={hint}>
        {currentIso ? <span className="nums shrink-0 text-[12px] leading-4 text-muted">сейчас {humanAqtobe(new Date(currentIso), now)}</span> : null}
      </PickerHead>

      <ul className="py-1">
        {presets.map((preset, index) => (
          <li key={preset.label}>
            <button
              type="button"
              onClick={() => onPick(preset.iso)}
              className="flex h-8 w-full items-center gap-2.5 px-3 text-left text-[13px] leading-4 transition-colors duration-[120ms] hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
              data-testid="deadline-preset"
            >
              <span className="min-w-0 flex-1 truncate">{preset.label}</span>
              {preset.iso ? <span className="nums text-[12px] text-muted">{dayWords(preset.iso.slice(0, 10))}</span> : null}
              <Kbd>{index + 1}</Kbd>
            </button>
          </li>
        ))}
      </ul>

      <div className="border-t border-border/70 px-3 pb-3 pt-2">
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Предыдущий месяц" title="Предыдущий месяц (PageUp)" onClick={() => setMonth((was) => addMonths(was, -1))} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-text">
            ‹
          </button>
          <span className="font-display text-[13px] font-semibold leading-4 first-letter:uppercase">{monthTitleRu(month)}</span>
          <button type="button" aria-label="Следующий месяц" title="Следующий месяц (PageDown)" onClick={() => setMonth((was) => addMonths(was, 1))} className="flex h-7 w-7 items-center justify-center rounded-[7px] text-muted hover:bg-surface-2 hover:text-text">
            ›
          </button>
        </div>
        <div role="grid" aria-label="Дата" className="mt-1 grid grid-cols-7 gap-0.5 text-center">
          {WEEKDAYS_SHORT_RU.map((day) => (
            <span key={day} className="text-[11px] leading-6 text-muted/70">
              {day}
            </span>
          ))}
          {grid.flat().map((day, index) =>
            day ? (
              <button
                key={day}
                type="button"
                tabIndex={-1}
                disabled={day < today}
                onClick={() => choose(day)}
                onDoubleClick={() => {
                  choose(day);
                  if (hm) onPick(wallIso(day, hm));
                }}
                aria-pressed={day === ymd}
                className={`nums relative h-7 rounded-[7px] text-[12px] leading-7 transition-colors duration-[120ms] disabled:text-muted/35 ${
                  day === ymd ? "bg-accent font-semibold text-bg" : "hover:bg-surface-2 disabled:hover:bg-transparent"
                } ${day === today && day !== ymd ? "font-semibold text-accent" : ""}`}
              >
                {Number(day.slice(8))}
              </button>
            ) : (
              <span key={`blank-${index}`} />
            ),
          )}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <label className="text-[12px] leading-4 text-muted" htmlFor="desk-deadline-time">
            Время
          </label>
          <input
            id="desk-deadline-time"
            value={time}
            onChange={(event) => setTime(event.target.value)}
            onBlur={() => hm && setTime(hm)}
            onKeyDown={(event) => {
              if (event.code !== "ArrowUp" && event.code !== "ArrowDown") return;
              event.preventDefault();
              setTime(stepHm(hm ?? "18:00", event.code === "ArrowUp" ? 15 : -15));
            }}
            inputMode="numeric"
            aria-invalid={!hm}
            className="nums field h-8 w-[68px] px-2 text-center text-[13px] leading-4 outline-none focus:border-accent aria-[invalid=true]:border-danger/60"
            data-testid="deadline-time"
          />
          <span className="text-[11px] leading-4 text-muted/80">↑↓ по 15 мин</span>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-[12px] leading-4 text-muted">
            {chosen ? (past ? "Это время уже прошло" : same ? "Тот же срок" : `${dayWords(ymd as string)}, ${hm}`) : "Выберите день"}
          </span>
          <button
            type="button"
            disabled={!ready}
            onClick={apply}
            className="btn-primary inline-flex h-8 items-center gap-1.5 rounded-[9px] px-3 font-display text-[13px] font-semibold leading-4 text-bg disabled:opacity-40"
            data-testid="deadline-apply"
          >
            Готово <span aria-hidden className="text-[11px] opacity-70">⏎</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* A person                                                                    */
/* -------------------------------------------------------------------------- */

export type Picked = { id: string; full_name: string };

/**
 * «Передать» / «Кому выдать?» on the desk: the caret in the search (the start of a name or a
 * position, D-108), the colleague the refusal suggests on top, who holds it now marked and out of
 * reach, each person's load beside the name — a desk chooses by the numbers. ↑/↓ and Enter;
 * `withNote` — a word for the new person under the list (D-128), Enter there passes too.
 */
export function PersonPicker({
  title,
  subject,
  currentId,
  suggestedIds = [],
  withNote = false,
  onPick,
}: {
  title: string;
  subject?: string | null;
  currentId: string | null;
  suggestedIds?: readonly string[];
  withNote?: boolean;
  onPick: (person: Picked, note: string) => void;
}) {
  const roster = useRoster();
  const loads = useTeamLoads();
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [at, setAt] = useState(0);
  const box = useOwnFocus<HTMLDivElement>();
  const list = useRef<HTMLUListElement>(null);

  const people = useMemo(() => {
    const found = searchPeople(roster.data ?? [], query);
    // the team first; a director is in the list, last — work is rarely handed up
    const team = [...found.filter((person) => person.role !== "director"), ...found.filter((person) => person.role === "director")];
    if (query.trim()) return team;
    const top = new Set(suggestedIds);
    return [...team.filter((person) => top.has(person.id)), ...team.filter((person) => !top.has(person.id))];
  }, [roster.data, query, suggestedIds]);
  const live = people.filter((person) => person.id !== currentId);
  const active = live[Math.min(at, live.length - 1)] ?? null;
  // the list keeps the height it opened with: a popover placed over its anchor must not shrink away from it as the search narrows
  const [rows] = useState(() => Math.max(3, Math.min(6.5, people.length || 6.5)));

  useEffect(() => {
    if (!active) return;
    list.current?.querySelector<HTMLElement>(`[data-person="${CSS.escape(active.id)}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const pick = (person: RosterEntry | null) => {
    if (!person || person.id === currentId) return;
    onPick({ id: person.id, full_name: person.full_name }, note.trim());
  };
  const onKey = (event: KeyboardEvent<HTMLElement>) => {
    if (event.code === "ArrowDown" || event.code === "ArrowUp") {
      event.preventDefault();
      setAt((index) => {
        const total = Math.max(1, live.length);
        return (Math.min(index, total - 1) + (event.code === "ArrowDown" ? 1 : total - 1)) % total;
      });
    } else if ((event.code === "Enter" || event.code === "NumpadEnter") && !event.shiftKey) {
      event.preventDefault();
      pick(active);
    }
  };

  const loadWords = (id: string) => {
    const load = loads.data?.[id];
    if (!load || load.active === 0) return "свободен";
    const late = load.overdue > 0 ? ` · ${load.overdue} ${pluralRu(load.overdue, ["просрочка", "просрочки", "просрочек"])}` : "";
    return `${load.active} в работе${late}`;
  };

  return (
    <div ref={box} className="flex flex-col" data-testid="desk-person-picker">
      <PickerHead title={title} hint={subject ? <span className="line-clamp-1">«{subject}»</span> : undefined} />
      <div className="px-2 pt-2">
        <input
          data-autofocus
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setAt(0);
          }}
          onKeyDown={onKey}
          placeholder="Имя или должность"
          aria-label="Поиск человека"
          className="field h-8 w-full px-2.5 text-[13px] leading-4 outline-none placeholder:text-muted focus:border-accent"
        />
      </div>
      <ul ref={list} role="listbox" aria-label={title} className="no-bar overflow-y-auto py-1" style={{ height: rows * 40 + 8 }}>
        {roster.isPending ? <li className="px-3 py-2 text-[13px] leading-4 text-muted">Загружаю людей…</li> : null}
        {!roster.isPending && people.length === 0 ? <li className="px-3 py-2 text-[13px] leading-4 text-muted">Никого не нашёл</li> : null}
        {people.map((person) => {
          const current = person.id === currentId;
          const on = active?.id === person.id;
          const suggested = !query.trim() && suggestedIds.includes(person.id);
          return (
            <li key={person.id} role="option" aria-selected={on} aria-disabled={current || undefined} data-person={person.id}>
              <button
                type="button"
                tabIndex={-1}
                disabled={current}
                onMouseEnter={() => !current && setAt(Math.max(0, live.indexOf(person)))}
                onClick={() => pick(person)}
                className={`flex h-10 w-full items-center gap-2.5 px-3 text-left transition-colors duration-[80ms] disabled:opacity-50 ${on ? "bg-surface-2" : ""}`}
              >
                <Avatar name={person.full_name} size={24} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] leading-4">{shortName(person.full_name)}</span>
                  {person.position ? <span className="truncate text-[11px] leading-[14px] text-muted">{person.position}</span> : null}
                </span>
                <span className={`shrink-0 text-[11px] leading-4 ${suggested ? "font-semibold text-accent" : "text-muted"}`}>
                  {current ? "сейчас" : suggested ? "предлагает" : loadWords(person.id)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {withNote ? (
        <div className="border-t border-border/70 px-2 py-2">
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onKeyDown={onKey}
            maxLength={500}
            placeholder="Пару слов новому исполнителю"
            aria-label="Слова новому исполнителю"
            className="field h-8 w-full px-2.5 text-[13px] leading-4 outline-none placeholder:text-muted focus:border-accent"
            data-testid="reassign-note"
          />
        </div>
      ) : null}
      <p className="flex items-center gap-3 whitespace-nowrap border-t border-border/70 px-3 py-1.5 text-[11px] leading-4 text-muted">
        <span className="inline-flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> выбрать
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Enter</Kbd> {withNote ? "передать" : "выдать"}
        </span>
        <span className="inline-flex items-center gap-1">
          <Kbd>Esc</Kbd> закрыть
        </span>
      </p>
    </div>
  );
}
