"use client";

import { useQuery } from "@tanstack/react-query";

import { useRealtimeInvalidate, useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";

import type { TvBoard } from "./board";
import { isTvKind, type TvEvent, type TvPayload } from "./feed";

/**
 * Данные киоска. Роль `tv` не видит ни задач, ни людей, ни компании — только таблицу
 * событий и вызов `tv_summary()` (миграция 20260917190000, docs/DATABASE.md «tv_events»).
 * Поэтому здесь нет ни одного запроса к рабочим таблицам: то, что нельзя прочитать,
 * не запрашивается даже «на всякий случай».
 */

export const tvKeys = {
  feed: ["tv", "feed"] as const,
  summary: (guest: boolean) => ["tv", "summary", guest] as const,
  state: ["tv", "state"] as const,
  focus: ["tv", "focus"] as const,
  calendar: (guest: boolean, from: string, days: number) => ["tv", "calendar", guest, from, days] as const,
  overlay: ["tv", "overlay"] as const,
  board: (guest: boolean) => ["tv", "board", guest] as const,
  rating: (guest: boolean, period: string) => ["tv", "rating", guest, period] as const,
};

/**
 * Лента на экране — последние события (CONCEPT §3.5: 8–10). Семь: первое идёт героем и
 * занимает место двух строк, а под лентой ещё стоит полоса команды.
 */
const FEED_LIMIT = 7;
/** Сводка живёт медленнее ленты: вердикт и карусель пересчитываются раз в минуту. */
const SUMMARY_REFRESH_MS = 60_000;

function payloadOf(value: Json): TvPayload {
  const record = (value && typeof value === "object" && !Array.isArray(value) ? value : {}) as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : null,
    title: typeof record.title === "string" ? record.title : null,
    amount: typeof record.amount === "number" ? record.amount : null,
  };
}

async function fetchFeed(): Promise<TvEvent[]> {
  const supabase = createBrowserSupabase();
  const { data, error } = await supabase
    .from("tv_events")
    .select("id, kind, created_at, payload, payload_guest")
    .order("created_at", { ascending: false })
    .limit(FEED_LIMIT);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((row) => isTvKind(row.kind))
    .map((row) => ({
      id: row.id,
      kind: row.kind as TvEvent["kind"],
      created_at: row.created_at,
      payload: payloadOf(row.payload),
      payload_guest: payloadOf(row.payload_guest),
    }));
}

export function useTvFeed() {
  return useRealtimeQuery<TvEvent[]>({
    queryKey: tvKeys.feed,
    queryFn: fetchFeed,
    channel: { table: "tv_events" },
  });
}

export type TvCounts = { overdue: number; declined: number; review: number; questions: number };
export type TvToday = { sent: number; done: number; in_work: number };
export type TvRatingRow = { name: string; points: number | null; rank: number };
export type TvLoadRow = { name: string; active: number; overdue: number };
export type TvWeekDay = { day: string; done: number };
export type TvMerchRow = { name: string; title: string; at: string };

/** Ближайшие встречи для бегущей строки и сцены «часы» (D-78). */
export type TvEventRow = {
  id: string;
  title: string | null;
  starts_at: string;
  location: string | null;
  people: number;
};

export type TvSummary = {
  guest: boolean;
  points_enabled: boolean;
  now: string;
  /** События по часам суток компании — из них рисуется фон «пульс дня». */
  pulse: number[];
  counts: TvCounts;
  today: TvToday;
  rating: TvRatingRow[];
  load: TvLoadRow[];
  week: TvWeekDay[];
  merch: TvMerchRow[];
  events: TvEventRow[];
};

const EMPTY_SUMMARY: TvSummary = {
  guest: false,
  points_enabled: false,
  now: new Date(0).toISOString(),
  pulse: [],
  counts: { overdue: 0, declined: 0, review: 0, questions: 0 },
  today: { sent: 0, done: 0, in_work: 0 },
  rating: [],
  load: [],
  week: [],
  merch: [],
  events: [],
};

/**
 * Вердикт, три числа дня и карусель — одним вызовом. Маска гостя считается в БД:
 * в гостевом режиме сюда физически не приезжают ни фамилии, ни очки (D-33).
 */
export function useTvSummary(guest: boolean) {
  const query = useQuery({
    queryKey: tvKeys.summary(guest),
    refetchInterval: SUMMARY_REFRESH_MS,
    queryFn: async (): Promise<TvSummary> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_summary", { p_guest: guest });
      if (error) throw new Error(error.message);
      return { ...EMPTY_SUMMARY, ...((data ?? {}) as Partial<TvSummary>) } as TvSummary;
    },
  });
  // событие меняет и числа, и карусель — сводка обновляется вместе с лентой
  useRealtimeInvalidate({ table: "tv_events" }, tvKeys.summary(guest));
  return query;
}

/* -------------------------------------------------------------------------- */
/* Пульт: что показывать и кого показывать                                    */
/* -------------------------------------------------------------------------- */

/**
 * Строка состояния экрана — одна на компанию (миграция 20260918100000, D-76). Она
 * пережила бы и ночной перезапуск киоска, и деплой: команда с пульта не эфемерна.
 * RLS отдаёт строку своей компании, поэтому фильтра по `company_id` здесь нет.
 */
export type TvState = Database["public"]["Tables"]["tv_state"]["Row"];

export function useTvState() {
  return useRealtimeQuery<TvState | null>({
    queryKey: tvKeys.state,
    queryFn: async (): Promise<TvState | null> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("tv_state").select("*").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    channel: { table: "tv_state" },
  });
}

/**
 * Одно событие из жизни дела (D-120): только вид и время — слов переписки на стене нет.
 * Отказ, «Настоять» и отзыв база не отдаёт вовсе, возврат на доработку — `again` (D-45).
 */
export type TvStoryKind =
  | "posted"
  | "seen"
  | "accepted"
  | "question"
  | "text"
  | "photo"
  | "voice"
  | "director"
  | "deadline"
  | "review"
  | "again"
  | "done";

export type TvStoryEvent = {
  k: TvStoryKind;
  at: string;
  /** Вопрос: когда директор ответил. */
  ans?: string;
  /** Новый срок. */
  to?: string;
  /** Срок снят. */
  cleared?: boolean;
  /** Сдача: с фото или с текстом отчёта. */
  rep?: "photo" | "text";
};

export type TvFocusTask = {
  id: string;
  /** Гостю заголовков не отдают вовсе — экран скажет «Поручение» (D-33). */
  title: string | null;
  status: string;
  deadline: string | null;
  /** Поля v3 (D-120) необязательны: киоск новее базы между деплоем и миграцией не падает. */
  source?: "voice" | "typed" | "shared" | null;
  story?: TvStoryEvent[];
};

/**
 * Рейтинг человека на стене (D-120). Гостю — `null` (D-33). Место — только из первой
 * пятёрки, иначе `null` (D-45); очки и недели — только при включённых очках.
 */
export type TvFocusRating = {
  points: boolean;
  rank?: number | null;
  /** Очки по неделям, старая первой; последняя — текущие 7 суток. */
  weeks?: number[] | null;
  done_week: number;
  on_time_week: number;
};

/** Числа над колонками карточки — по всем открытым делам, а не по показанным (D-96). */
export type TvFocusCounts = { new: number; work: number; review: number };

export type TvFocusEmployee = {
  mode: "employee";
  guest: boolean;
  expires_at: string;
  /** Поля v2 необязательны: киоск новее базы между деплоем и миграцией не падает. */
  employee: { id: string; name: string; position: string | null; avatar_url?: string | null };
  tasks: TvFocusTask[];
  counts?: TvFocusCounts;
  /** Что директор принял сегодня: позитив по имени на стену можно (D-45). */
  done_today?: { count: number; titles: (string | null)[] };
  /** Очки недели — только при включённых очках и без гостя (D-33, D-40). */
  points_week?: number | null;
  /** v3: рейтинг и итоги недели; `null` — гость в кабинете. */
  rating?: TvFocusRating | null;
  /** v3: сданное за неделю с хронологией — на стене, когда открытых дел нет. */
  done_recent?: TvFocusTask[];
};

/** Сколько было сказано и показано по делу — числами, без слов (D-123). */
export type TvTaskCounts = { photos: number; voices: number; texts: number; questions: number };

/**
 * Одно дело во весь экран (D-123): исполнитель, дело целиком и вся его история. Гостю —
 * без названия и без слов директора (D-33); отказанное или отозванное дело база не отдаёт.
 */
export type TvTaskFocus = {
  mode: "task";
  guest: boolean;
  expires_at: string;
  employee: { id: string; name: string; position: string | null; avatar_url?: string | null } | null;
  task: TvFocusTask & {
    body?: string | null;
    created_at?: string;
    closed_at?: string | null;
    counts?: TvTaskCounts;
  };
};

export type TvFocus = { mode: "ether" } | TvFocusEmployee | TvTaskFocus;

/** Страховка на случай, если realtime промолчал: фокус живёт всего 10 минут. */
const FOCUS_REFRESH_MS = 30_000;

/**
 * Данные фокуса одним вызовом `tv_focus()`: роль `tv` не читает ни `tasks`, ни
 * `profiles` — функция сама берёт строку своей компании и отдаёт уже готовое.
 * Обновляется и от смены цели (`tv_state`), и от событий по задачам (`tv_events`):
 * сотрудник принял задачу, пока стоит на стене — стена это показала.
 */
export function useTvFocus(enabled: boolean) {
  const query = useQuery({
    queryKey: tvKeys.focus,
    enabled,
    refetchInterval: FOCUS_REFRESH_MS,
    queryFn: async (): Promise<TvFocus> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_focus");
      if (error) throw new Error(error.message);
      return (data ?? { mode: "ether" }) as unknown as TvFocus;
    },
  });
  useRealtimeInvalidate({ table: "tv_events" }, tvKeys.focus, enabled);
  useRealtimeInvalidate({ table: "tv_state" }, tvKeys.focus, enabled);
  return query;
}

/* -------------------------------------------------------------------------- */
/* Заставка «Рейтинг» (D-123)                                                  */
/* -------------------------------------------------------------------------- */

export type TvLeader = {
  id: string;
  name: string;
  position: string | null;
  avatar_url: string | null;
  points: number;
  rank: number;
  delta: number;
  done: number;
  on_time: number;
};

export type TvAward = { name: string; amount: number; reason: string; at: string };

/**
 * Первая пятёрка периода, кто вырос больше всех, последние награды и итог команды.
 * `hidden` — гость в кабинете (D-33): больше ничего не приходит; `enabled: false` — очки
 * выключены (D-48), заставки нет.
 */
export type TvRatingScene = {
  hidden: boolean;
  enabled: boolean;
  period: "week" | "month";
  top: TvLeader[];
  riser: { id: string; name: string; avatar_url: string | null; delta: number; points: number } | null;
  awards: TvAward[];
  team: { done: number; on_time: number; earned: number; people: number };
};

/** Рейтинг меняется наградами: по событию стены — сразу, иначе — раз в минуту. */
const RATING_REFRESH_MS = 60_000;

export function useTvRating(guest: boolean, enabled: boolean, period: "week" | "month") {
  const key = tvKeys.rating(guest, period);
  const query = useQuery({
    queryKey: key,
    enabled,
    refetchInterval: RATING_REFRESH_MS,
    queryFn: async (): Promise<TvRatingScene> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_rating", { p_guest: guest, p_period: period });
      if (error) throw new Error(error.message);
      const value = (data ?? {}) as Partial<TvRatingScene>;
      return {
        hidden: value.hidden ?? false,
        enabled: value.enabled ?? false,
        period: value.period === "month" ? "month" : "week",
        top: value.top ?? [],
        riser: value.riser ?? null,
        awards: value.awards ?? [],
        team: { done: 0, on_time: 0, earned: 0, people: 0, ...(value.team ?? {}) },
      };
    },
  });
  // a reward emits a wall event (`points`): the scene updates with it
  useRealtimeInvalidate({ table: "tv_events" }, key, enabled);
  // the guest switch and the period live in the wall row
  useRealtimeInvalidate({ table: "tv_state" }, key, enabled);
  return query;
}

/* -------------------------------------------------------------------------- */
/* Неделя мероприятий и надпись поверх сцены (D-96)                          */
/* -------------------------------------------------------------------------- */

export type TvCalendarEvent = {
  id: string;
  /** Гостю названий и мест не отдают (D-33): экран скажет «Мероприятие». */
  title: string | null;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  everyone: boolean;
  people: number;
  going: number;
};

export type TvCalendar = { from: string; days: number; events: TvCalendarEvent[] };

/** Календарь живёт медленно: раз в минуту хватает, напоминание приходит своей строкой. */
const CALENDAR_REFRESH_MS = 60_000;

/**
 * Мероприятия для заставки «Календарь» одним вызовом `tv_calendar()`: роль `tv` не читает
 * `events` (D-78 §4). Неделя — семь дней с сегодня; месяц — шесть недель с понедельника
 * первой недели месяца (`from` — `YYYY-MM-DD`, D-98). Сокета на мероприятия у киоска нет,
 * поэтому раз в минуту и по каждому событию стены (напоминание пишет `tv_events`).
 */
export function useTvCalendar(guest: boolean, enabled: boolean, range: { from: string | null; days: number }) {
  const key = tvKeys.calendar(guest, range.from ?? "today", range.days);
  const query = useQuery({
    queryKey: key,
    enabled,
    refetchInterval: CALENDAR_REFRESH_MS,
    queryFn: async (): Promise<TvCalendar> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_calendar", {
        p_guest: guest,
        p_days: range.days,
        p_from: range.from ?? undefined,
      });
      if (error) throw new Error(error.message);
      const value = (data ?? {}) as Partial<TvCalendar>;
      return { from: value.from ?? new Date().toISOString(), days: value.days ?? range.days, events: value.events ?? [] };
    },
  });
  useRealtimeInvalidate({ table: "tv_events" }, key, enabled);
  return query;
}

/** Страховка, если сокет промолчал: доска на стене не должна отставать от телефона дольше. */
const BOARD_REFRESH_MS = 30_000;

/**
 * Доска на стене (D-102): роль `tv` таблиц `notes` и `mind_boards` не читает — функция
 * отдаёт только доску, которую автор сам поставил на стену, с маской гостя. Правка такой
 * доски поднимает версию `tv_state`, которую киоск и так слушает, — отдельного сокета нет.
 */
export function useTvBoard(guest: boolean, enabled: boolean) {
  const key = tvKeys.board(guest);
  const query = useQuery({
    queryKey: key,
    enabled,
    refetchInterval: BOARD_REFRESH_MS,
    queryFn: async (): Promise<TvBoard> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_board", { p_guest: guest });
      if (error) throw new Error(error.message);
      const value = (data ?? {}) as Partial<TvBoard>;
      return { board: value.board ?? null, hidden: value.hidden ?? false };
    },
  });
  useRealtimeInvalidate({ table: "tv_state" }, key, enabled);
  return query;
}

export type TvVisitStatus = "waiting" | "wait";

export type TvOverlayVisit = {
  id: string;
  status: TvVisitStatus;
  /** Слова секретаря; гостю не приезжают (D-33). */
  note: string | null;
  created_at: string;
  answered_at: string | null;
};

/** Сообщение секретаря на экран (D-116): самое свежее непрочитанное. */
export type TvOverlayMessage = {
  id: string;
  /** Слова секретаря; гостю не приезжают (D-33). */
  note: string | null;
  created_at: string;
};

export type TvOverlay = {
  visit: TvOverlayVisit | null;
  waiting: number;
  message: TvOverlayMessage | null;
  /** Сколько сообщений ждут «Понятно». */
  messages: number;
};

/** Страховка, если сокет промолчал: посетитель у стола не должен ждать дольше. */
const OVERLAY_REFRESH_MS = 20_000;

/**
 * «К вам посетитель» (D-96) и сообщение секретаря (D-116): роль `tv` таблицу `visits` не
 * читает — функция отдаёт готовую надпись с маской гостя. Каждое изменение визита поднимает
 * версию `tv_state`, которую киоск и так слушает, поэтому отдельного сокета здесь нет.
 */
export function useTvOverlay() {
  const query = useQuery({
    queryKey: tvKeys.overlay,
    refetchInterval: OVERLAY_REFRESH_MS,
    queryFn: async (): Promise<TvOverlay> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_overlay");
      if (error) throw new Error(error.message);
      const value = (data ?? {}) as Partial<TvOverlay>;
      return {
        visit: value.visit ?? null,
        waiting: value.waiting ?? 0,
        message: value.message ?? null,
        messages: value.messages ?? 0,
      };
    },
  });
  useRealtimeInvalidate({ table: "tv_state" }, tvKeys.overlay);
  return query;
}
