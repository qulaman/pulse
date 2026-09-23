"use client";

import { useState } from "react";

import { TvFrame } from "@/components/tv/TvFrame";
import { useClock } from "@/components/tv/useKiosk";
import { lineOf, type TvEvent } from "@/lib/tv/feed";
import { overlayOf } from "@/lib/tv/overlay";
import type { TvCalendar, TvFocusEmployee, TvOverlay, TvSummary } from "@/lib/tv/queries";
import type { ClockStyle, TvScene } from "@/lib/tv/state";
import { tickerItems } from "@/lib/tv/ticker";
import { speechOf } from "@/lib/tv/voice";

export type WallCase =
  | "face"
  | "clock"
  | "team"
  | "calendar"
  | "focus"
  | "focus-empty"
  | "visit"
  | "wait"
  | "in"
  | "event"
  | "night";

const MIN = 60_000;
const at = (base: number, minutes: number) => new Date(base + minutes * MIN).toISOString();

/** Today at hh:mm in Aqtobe (+05:00), relative to the moment the sandbox opened. */
function todayAt(base: number, hh: number, mm = 0, dayOffset = 0): string {
  const offset = 5 * 3_600_000;
  const day = Math.floor((base + offset) / 86_400_000) + dayOffset;
  return new Date(day * 86_400_000 - offset + (hh * 60 + mm) * MIN).toISOString();
}

function fixtures(base: number, guest: boolean) {
  const name = (full: string) => (guest ? full.split(" ")[0] : full);
  const events: TvEvent[] = [
    { kind: "task_done", name: "Айгерим Сапарова", title: "Сверка с бухгалтерией", ago: 4 },
    { kind: "task_accepted", name: "Марат Ахметов", title: "Бетон на третий этаж", ago: 11 },
    { kind: "announcement", name: "Директор", title: "В пятницу короткий день — до 16:00", ago: 35 },
    { kind: "task_sent", name: "Ерлан Беков", title: "Замер окон на объекте «Север»", ago: 52 },
  ].map((e, i) => ({
    id: `ev${i}`,
    kind: e.kind as TvEvent["kind"],
    created_at: at(base, -e.ago),
    payload: { name: e.name, title: e.title, amount: null },
    payload_guest: { name: e.name.split(" ")[0], title: null, amount: null },
  }));

  const team = [
    ["Марат Ахметов", 4],
    ["Айгерим Сапарова", 2],
    ["Ерлан Беков", 3],
    ["Динара Касымова", 0],
    ["Айгуль Нурланова", 1],
    ["Ерлан Досанов", 2],
    ["Сауле Ибраева", 0],
    ["Тимур Жаксылыков", 5],
    ["Асель Муратова", 1],
    ["Нурлан Серикбаев", 2],
  ] as const;

  const summary: TvSummary = {
    guest,
    points_enabled: true,
    now: new Date(base).toISOString(),
    pulse: [0, 0, 0, 0, 0, 0, 0, 1, 4, 9, 12, 8, 5, 7, 11, 6, 3, 2, 1, 0, 0, 0, 0, 0],
    counts: { overdue: 1, declined: 0, review: 2, questions: 1 },
    today: { sent: 14, done: 9, in_work: 21 },
    rating: team.slice(0, 5).map(([n], i) => ({ name: name(n), points: guest ? null : 60 - i * 7, rank: i + 1 })),
    load: team.map(([n, active]) => ({ name: name(n), active, overdue: 0 })),
    week: [],
    merch: [],
    events: [
      { id: "e-soon", title: guest ? null : "Планёрка", starts_at: at(base, 15), location: guest ? null : "Переговорная", people: 8 },
      { id: "e-later", title: guest ? null : "Приёмка объекта", starts_at: todayAt(base, 17, 30), location: null, people: 4 },
    ],
  };

  const focus: TvFocusEmployee = {
    mode: "employee",
    guest,
    expires_at: at(base, 7),
    employee: { id: "p1", name: name("Марат Ахметов"), position: "Прораб, участок «Север»", avatar_url: null },
    tasks: [
      { id: "t1", title: "Смета по кровле для нового корпуса", status: "sent", deadline: todayAt(base, 18) },
      { id: "t2", title: "Забрать пропуска на объект", status: "sent", deadline: todayAt(base, 12, 0, 1) },
      { id: "t3", title: "Бетон на третий этаж", status: "accepted", deadline: todayAt(base, 18, 0, 3) },
      { id: "t4", title: "Замер окон", status: "rework", deadline: todayAt(base, 10, 0, 1) },
      { id: "t5", title: "Договор с поставщиком арматуры: согласовать объёмы на октябрь", status: "in_progress", deadline: null },
      { id: "t6", title: "Фотоотчёт по фасаду", status: "accepted", deadline: todayAt(base, 12, 0, 5) },
      { id: "t7", title: "Акт по забору", status: "pending_review", deadline: null },
    ].map((t) => (guest ? { ...t, title: null } : t)),
    counts: { new: 2, work: 5, review: 1 },
    done_today: { count: 2, titles: guest ? [null, null] : ["Сверка с бухгалтерией", "Вывоз мусора"] },
    points_week: guest ? null : 42,
  };

  const calendar: TvCalendar = {
    from: todayAt(base, 0),
    days: 7,
    events: [
      { id: "c1", title: "Планёрка", starts_at: todayAt(base, 9), ends_at: todayAt(base, 9, 30), location: "Переговорная", everyone: true, people: 24, going: 20 },
      { id: "c2", title: "Созвон с поставщиком", starts_at: at(base, -20), ends_at: at(base, 25), location: null, everyone: false, people: 3, going: 3 },
      { id: "c3", title: "Приёмка объекта «Север»", starts_at: todayAt(base, 17, 30), ends_at: null, location: "Объект", everyone: false, people: 4, going: 2 },
      { id: "c4", title: "Выезд на объект «Юг»", starts_at: todayAt(base, 10, 0, 2), ends_at: null, location: null, everyone: false, people: 5, going: 1 },
      { id: "c5", title: "Планёрка", starts_at: todayAt(base, 9, 0, 3), ends_at: null, location: "Переговорная", everyone: true, people: 24, going: 0 },
      { id: "c6", title: "Встреча с заказчиком по второму корпусу", starts_at: todayAt(base, 15, 0, 3), ends_at: todayAt(base, 16, 30, 3), location: "Кабинет директора", everyone: false, people: 3, going: 2 },
      { id: "c7", title: "Корпоратив", starts_at: todayAt(base, 19, 0, 5), ends_at: null, location: "Ресторан", everyone: true, people: 30, going: 12 },
    ].map((e) => (guest ? { ...e, title: null, location: null } : e)),
  };

  return { events, summary, focus, calendar };
}

function overlayFor(wallCase: WallCase, base: number, guest: boolean): TvOverlay {
  const note = guest ? null : "Иванов, по поставкам бетона";
  if (wallCase === "visit") {
    return { visit: { id: "v1", status: "waiting", note, created_at: at(base, -3), answered_at: null }, waiting: 1 };
  }
  if (wallCase === "wait") {
    return { visit: { id: "v1", status: "wait", note, created_at: at(base, -9), answered_at: at(base, -2) }, waiting: 1 };
  }
  if (wallCase === "in") {
    return { visit: { id: "v1", status: "invited", note: null, created_at: at(base, -4), answered_at: new Date(base).toISOString() }, waiting: 0 };
  }
  return { visit: null, waiting: 0 };
}

export function WallSandbox({ wallCase, clock, guest }: { wallCase: WallCase; clock: ClockStyle; guest: boolean }) {
  const [base] = useState(() => Date.now());
  const live = useClock();
  // the night case pins the clock to 23:10 in Aqtobe; every other case runs on the real one
  const now = wallCase === "night" ? new Date(todayAt(base, 23, 10)) : live;
  const data = fixtures(base, guest);
  const lines = data.events.map((event) => lineOf(event, guest));
  const scene: TvScene = wallCase === "clock" || wallCase === "team" || wallCase === "calendar" ? wallCase : "face";
  // the event notice needs the meeting exactly fifteen minutes out; elsewhere keep it clear
  const summary = wallCase === "event" ? data.summary : { ...data.summary, events: data.summary.events.slice(1) };

  return (
    <div className="h-dvh w-full overflow-hidden bg-bg" style={{ cursor: "default" }}>
      <TvFrame
        company="Компания"
        logoUrl={null}
        now={now}
        guest={guest}
        scene={scene}
        clock={clock}
        night={wallCase === "night"}
        offline={false}
        items={tickerItems(lines, summary)}
        speech={speechOf(lines, summary.today, now)}
        summary={summary}
        focus={wallCase === "focus" ? data.focus : wallCase === "focus-empty" ? { ...data.focus, tasks: [], counts: { new: 0, work: 0, review: 0 } } : null}
        focusRemainingMs={7 * MIN}
        calendar={data.calendar}
        overlay={overlayOf(overlayFor(wallCase, base, guest), summary.events, new Date(base))}
        sound={false}
      />
    </div>
  );
}
