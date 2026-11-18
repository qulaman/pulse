"use client";

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";

import { useRealtimeListener, useRealtimeQuery, type ChannelSpec } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import type { Database, Json } from "@/lib/supabase/types";

import { boardFrom, type TvBoard } from "./board";
import { isTvKind, type TvEvent, type TvPayload } from "./feed";
import { EMPTY_SUMMARY } from "./scenes";

/**
 * Данные киоска. Роль `tv` не видит ни задач, ни людей, ни компании — только таблицу
 * событий и вызов `tv_summary()` (миграция 20260917190000, docs/DATABASE.md «tv_events»).
 * Поэтому здесь нет ни одного запроса к рабочим таблицам: то, что нельзя прочитать,
 * не запрашивается даже «на всякий случай».
 *
 * Два сокета на стену (D-182): `tv_events` (лента) и `tv_state` (строка стены), оба с фильтром
 * по компании, когда стена её знает. Остальные данные стены от сокетов не слушают сами:
 * события ленты перечитывают сводку, фокус, рейтинг и календарь (`useTvFeed`), смена версии
 * строки — фокус, рейтинг, доску и надпись (`useOnWallVersion`). Квитанция киоска раз в минуту
 * версию не меняет и поэтому ничего не перечитывает.
 */

export const tvKeys = {
  feed: ["tv", "feed"] as const,
  summary: (guest: boolean) => ["tv", "summary", guest] as const,
  state: ["tv", "state"] as const,
  focus: ["tv", "focus"] as const,
  calendar: (guest: boolean, from: string, days: number) => ["tv", "calendar", guest, from, days] as const,
  overlay: ["tv", "overlay"] as const,
  board: (guest: boolean, which: string | null = null) => ["tv", "board", guest, which] as const,
  rating: (guest: boolean, period: string) => ["tv", "rating", guest, period] as const,
};

/**
 * Лента на экране — последние события (CONCEPT §3.5: 8–10). Семь: первое идёт героем и
 * занимает место двух строк, а под лентой ещё стоит полоса команды.
 */
const FEED_LIMIT = 7;
/** Сводка живёт медленнее ленты: вердикт и карусель пересчитываются раз в минуту. */
const SUMMARY_REFRESH_MS = 60_000;
/** Страховка ленты, если сокет промолчал (D-182): стена не ждёт следующего события дольше. */
const FEED_REFRESH_MS = 3 * 60_000;
/** Страховка строки стены, если сокет промолчал (D-182). */
const STATE_REFRESH_MS = 60_000;

/** Только строки своей компании: сервер Realtime не проверяет чужие строки на каждом подписчике. */
function channelOf(table: "tv_events" | "tv_state", companyId?: string | null): ChannelSpec {
  return companyId ? { table, filter: `company_id=eq.${companyId}` } : { table };
}

/** Data of the wall that a wall event can change: the feed's channel refreshes it (D-182). */
const ON_WALL_EVENT = new Set(["summary", "focus", "rating", "calendar"]);

function onWallEvent(key: QueryKey): boolean {
  return key[0] === "tv" && typeof key[1] === "string" && ON_WALL_EVENT.has(key[1]);
}

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

/**
 * Лента стены и всё, что от неё зависит. `companyId` — компания стены (D-182): с ним канал
 * слушает только её строки. Событие ленты перечитывает и сводку, фокус, рейтинг и календарь —
 * один сокет на стену вместо своего у каждого; без ленты на экране они живут своим опросом.
 */
export function useTvFeed(companyId?: string | null) {
  const queryClient = useQueryClient();
  const channel = channelOf("tv_events", companyId);
  const query = useRealtimeQuery<TvEvent[]>({
    queryKey: tvKeys.feed,
    queryFn: fetchFeed,
    channel,
    refetchInterval: FEED_REFRESH_MS,
  });
  useRealtimeListener(
    channel,
    () => {
      void queryClient.invalidateQueries({ predicate: (q) => onWallEvent(q.queryKey) });
    },
    // a resync joins a fetch already on its way (D-126)
    () => {
      void queryClient.invalidateQueries({ predicate: (q) => onWallEvent(q.queryKey) }, { cancelRefetch: false });
    },
    "tv-wall-events",
  );
  return query;
}

export type TvCounts = { overdue: number; declined: number; review: number; questions: number };
export type TvToday = { sent: number; done: number; in_work: number };
export type TvRatingRow = { name: string; points: number | null; rank: number };
/**
 * `overdue` is always 0 since D-182 (no debts by name on the wall, D-45) — kept for older builds.
 * `done_today` — accepted today; an older database sends none.
 */
export type TvLoadRow = { name: string; active: number; overdue: number; done_today?: number };
export type TvWeekDay = { day: string; done: number };
export type TvMerchRow = { name: string; title: string; at: string };

/** Ближайшие встречи для бегущей строки и сцены «часы» (D-78). */
export type TvEventRow = {
  id: string;
  title: string | null;
  starts_at: string;
  location: string | null;
  people: number;
  /** The director called it or goes to it (D-182); an older database sends none — read as true. */
  director?: boolean;
};

/** Программа дня стены (D-182): «ЧЧ:ММ» по Актобе — ночь из окна доставки, вечер — с часа отчёта. */
export type TvProgramWindow = { night_from: string; night_to: string; evening_from: string };
/** Последнее сегодняшнее объявление и сколько людей его прочли; гостю не приезжает (D-33). */
export type TvAnnouncement = { id: string; text: string; at: string; acks: number };
/** «Итог дня»: принято сегодня, очков (гостю и без очков — null), людей с принятым, до трёх наград. */
export type TvDayResult = { done: number; points: number | null; people: number; awards: TvAward[] };
/** «Итог недели» за семь суток с сегодня: принято, очков (гостю — null), лучший день, лидер (гостю — имя). */
export type TvWeekResult = {
  done: number;
  points: number | null;
  best_day: { day: string; done: number } | null;
  leader: string | null;
};
/**
 * Темп: принято сегодня; обычно к этому часу и за весь день — среднее тех же дней недели за
 * четыре недели (дни без принятого не в счёт); рекорд дня за восемь недель без сегодня.
 */
export type TvPace = { done: number; usual_now: number; usual_day: number; best_day: number };

export type TvSummary = {
  guest: boolean;
  points_enabled: boolean;
  now: string;
  /** События по часам суток компании — из них рисуется фон «пульс дня». */
  pulse: number[];
  /** Гостю — нули (D-33). */
  counts: TvCounts;
  today: TvToday;
  rating: TvRatingRow[];
  load: TvLoadRow[];
  week: TvWeekDay[];
  merch: TvMerchRow[];
  events: TvEventRow[];
  /* Поля стены v5 (D-182) необязательны: киоск новее базы между деплоем и миграцией не падает. */
  program?: TvProgramWindow;
  announcement?: TvAnnouncement | null;
  day?: TvDayResult;
  week_result?: TvWeekResult;
  pace?: TvPace;
};

// one empty summary for the kiosk and the sandbox (D-182)

/**
 * Вердикт, три числа дня и карусель — одним вызовом. Маска гостя считается в БД:
 * в гостевом режиме сюда физически не приезжают ни фамилии, ни очки (D-33). Событие ленты
 * перечитывает сводку через `useTvFeed` — числа и карусель обновляются вместе с лентой.
 */
export function useTvSummary(guest: boolean) {
  return useQuery({
    queryKey: tvKeys.summary(guest),
    refetchInterval: SUMMARY_REFRESH_MS,
    queryFn: async (): Promise<TvSummary> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_summary", { p_guest: guest });
      if (error) throw new Error(error.message);
      return { ...EMPTY_SUMMARY, ...((data ?? {}) as Partial<TvSummary>) } as TvSummary;
    },
  });
}

/* -------------------------------------------------------------------------- */
/* Пульт: что показывать и кого показывать                                    */
/* -------------------------------------------------------------------------- */

/**
 * Строка состояния экрана — одна на компанию (миграция 20260918100000, D-76). Она
 * пережила бы и ночной перезапуск киоска, и деплой: команда с пульта не эфемерна.
 * RLS отдаёт строку своей компании, поэтому в запросе фильтра по `company_id` нет.
 */
export type TvState = Database["public"]["Tables"]["tv_state"]["Row"];

/** What the kiosk writes into the row by itself, each minute — its receipt (D-76 §9, D-182). */
type Receipt = Pick<TvState, "seen_at" | "applied_version" | "health">;

function timeOf(iso: string | null | undefined): number {
  const at = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(at) ? at : -Infinity;
}

/**
 * A change of the wall row that came over the socket, laid onto the cached row (D-182). Every
 * command raises `version`: a higher one is the new row (keys the socket left out keep their
 * value). The same or a lower version is the kiosk's receipt, or a late echo of a row already
 * replaced: only the receipt fields move, and only forward — a command the remote has just
 * patched into the cache is not rolled back by the wall's minute heartbeat. `null` — the row is gone.
 */
export function mergeTvRow(prev: TvState | null | undefined, next: Partial<TvState> | null): TvState | null | undefined {
  if (next === null) return null;
  // no row cached yet and only a receipt in the event: leave the cache as it is (`undefined` — not loaded)
  if (!prev) return typeof next.company_id === "string" && typeof next.version === "number" ? (next as TvState) : prev;
  // another company's row never lands on this one (RLS already keeps it away)
  if (next.company_id !== undefined && next.company_id !== prev.company_id) return prev;
  if (typeof next.version === "number" && next.version > prev.version) return { ...prev, ...next };
  if (timeOf(next.seen_at) < timeOf(prev.seen_at)) return prev;
  const receipt: Partial<Receipt> = {};
  if (next.seen_at !== undefined) receipt.seen_at = next.seen_at;
  if (next.applied_version !== undefined) receipt.applied_version = next.applied_version;
  if (next.health !== undefined) receipt.health = next.health;
  return { ...prev, ...receipt };
}

/**
 * The row of the wall. `companyId` — the wall's company (D-182): the channel listens to its row
 * only. A change of the row is laid into the cache as it came (`mergeTvRow`), not read again:
 * the kiosk's heartbeat updates the row every minute, and each one used to make every wall and
 * remote read the row, the overlay, the focus, the board and the rating anew. The data that
 * follows the row is read again when its `version` moves (`useOnWallVersion`). A safety read
 * once a minute catches what the socket missed.
 */
export function useTvState(companyId?: string | null) {
  return useRealtimeQuery<TvState | null, TvState>({
    queryKey: tvKeys.state,
    queryFn: async (): Promise<TvState | null> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.from("tv_state").select("*").limit(1).maybeSingle();
      if (error) throw new Error(error.message);
      return data ?? null;
    },
    channel: channelOf("tv_state", companyId),
    refetchInterval: STATE_REFRESH_MS,
    onEvent: (payload, queryClient) => {
      if (payload.eventType === "DELETE") {
        // a delete carries the key alone; only our own row's delete empties the cache
        const gone = (payload.old as Partial<TvState>).company_id;
        queryClient.setQueryData<TvState | null>(tvKeys.state, (prev) =>
          prev && gone !== undefined && gone !== prev.company_id ? prev : null,
        );
        return;
      }
      queryClient.setQueryData<TvState | null>(tvKeys.state, (prev) => mergeTvRow(prev, payload.new as Partial<TvState>));
    },
  });
}

/** Whether a cache event is the wall row's: `tvKeys.state`. */
function isWallRow(key: QueryKey): boolean {
  return key[0] === tvKeys.state[0] && key[1] === tvKeys.state[1] && key.length === tvKeys.state.length;
}

function versionOf(row: unknown): number | null {
  const version = (row as TvState | null | undefined)?.version;
  return typeof version === "number" ? version : null;
}

/**
 * Read `queryKey` again when the wall row's `version` moves (D-182) — a command from the remote,
 * a visitor (`tv_touch`), a board edited on the wall. The minute receipt of the kiosk leaves the
 * version as it was and reads nothing. Watches the cache, whatever brought the row: the socket,
 * the safety read, a resync, the remote's own command.
 */
function useOnWallVersion(queryKey: QueryKey, enabled = true) {
  const queryClient = useQueryClient();
  // the latest key: the rating's period or the board's guest changes it, the watch stays
  const keyRef = useRef(queryKey);
  useEffect(() => {
    keyRef.current = queryKey;
  });

  useEffect(() => {
    if (!enabled) return;
    const known = queryClient.getQueryState(tvKeys.state)?.status === "success";
    // undefined — the row has not been seen yet: its first arrival is no change
    let seen: number | null | undefined = known ? versionOf(queryClient.getQueryData(tvKeys.state)) : undefined;
    return queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.action.type !== "success" || !isWallRow(event.query.queryKey)) return;
      const version = versionOf(event.query.state.data);
      if (seen === undefined || version === seen) {
        seen = version;
        return;
      }
      seen = version;
      void queryClient.invalidateQueries({ queryKey: keyRef.current });
    });
  }, [queryClient, enabled]);
}

/**
 * Keep a query out of the phone's copy of the app (D-127): a board's drawings are heavy, a focus and a
 * notice are moments — a wall that comes back from its snapshot must not show yesterday's.
 */
const NOT_KEPT = { keep: false } as const;

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
 * Обновляется и от смены цели (версия `tv_state`), и от событий по задачам (лента стены,
 * `useTvFeed`): сотрудник принял задачу, пока стоит на стене — стена это показала.
 * В офлайн-копию не попадает: человек на стене — момент, а не данные на завтра.
 */
export function useTvFocus(enabled: boolean) {
  const query = useQuery({
    queryKey: tvKeys.focus,
    enabled,
    refetchInterval: FOCUS_REFRESH_MS,
    meta: NOT_KEPT,
    queryFn: async (): Promise<TvFocus> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_focus");
      if (error) throw new Error(error.message);
      return (data ?? { mode: "ether" }) as unknown as TvFocus;
    },
  });
  useOnWallVersion(tvKeys.focus, enabled);
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
  /** Handovers in time in a row (`profiles.streak_count`, D-133); older databases send none. */
  streak?: number;
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
  // a reward emits a wall event (`points`): the feed's channel reads the scene again (useTvFeed);
  // the guest switch and the period live in the wall row
  useOnWallVersion(key, enabled);
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
 * поэтому раз в минуту и по каждому событию стены (напоминание пишет `tv_events`; перечитывает
 * канал ленты, `useTvFeed`).
 */
export function useTvCalendar(guest: boolean, enabled: boolean, range: { from: string | null; days: number }) {
  const key = tvKeys.calendar(guest, range.from ?? "today", range.days);
  return useQuery({
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
}

/** Страховка, если сокет промолчал: доска на стене не должна отставать от телефона дольше. */
const BOARD_REFRESH_MS = 30_000;

/**
 * Доска на стене (D-102): роль `tv` таблиц `notes` и `mind_boards` не читает — функция
 * отдаёт только доску, которую автор сам поставил на стену, с маской гостя. Правка такой
 * доски поднимает версию `tv_state`, которую киоск и так слушает, — отдельного сокета нет.
 * Рисунки пунктов тяжелы — в офлайн-копию доска не попадает (D-182).
 */
export function useTvBoard(guest: boolean, enabled: boolean, which: string | null = null) {
  // the board the wall expects (the meeting's or the week's): another one is another cache, so a
  // run-out meeting's board never stands in the week board's turn while the answer is on its way
  const key = tvKeys.board(guest, which);
  const query = useQuery({
    queryKey: key,
    enabled,
    refetchInterval: BOARD_REFRESH_MS,
    meta: NOT_KEPT,
    queryFn: async (): Promise<TvBoard> => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase.rpc("tv_board", { p_guest: guest });
      if (error) throw new Error(error.message);
      return boardFrom(data);
    },
  });
  useOnWallVersion(key, enabled);
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
 * Надпись — момент: в офлайн-копию она не попадает, а старая гаснет по возрасту (`overlayOf`).
 */
export function useTvOverlay() {
  const query = useQuery({
    queryKey: tvKeys.overlay,
    refetchInterval: OVERLAY_REFRESH_MS,
    meta: NOT_KEPT,
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
  useOnWallVersion(tvKeys.overlay);
  return query;
}
