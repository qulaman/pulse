import type { Note } from "@/lib/notes/queries";
import type { TvState } from "@/lib/tv/queries";

/**
 * Boards of «Заметки» on fixtures (D-102, D-121) for /dev/board: every state of the screen
 * without a login or the shared database. Times are relative to the moment the sandbox opens.
 */

export const BOARD_CASES = ["empty", "few", "branches", "many", "long", "offline", "waits", "onwall", "recording"] as const;
export type BoardCase = (typeof BOARD_CASES)[number];

export const COMPANY = "company";
export const DIRECTOR = "u-director";
export const BOARD_ID = "board-1";

const MIN = 60_000;

export type BoardFixture = {
  title: string;
  rows: Note[];
  /** Lines only on the phone (not in the cache yet). */
  phone: string[];
  /** Lines created on the phone and not on the server yet. */
  owed: string[];
  /** Owed lines that have waited too long. */
  late: string[];
  online: boolean;
  /** Voice lines whose words are on their way. */
  hearing: string[];
  wall: { onWall: boolean; spot: string | null };
};

function note(base: number, id: string, text: string, position: number, extra: Partial<Note> = {}): Note {
  const created = new Date(base - (60 - position) * MIN).toISOString();
  return {
    id,
    company_id: COMPANY,
    user_id: DIRECTOR,
    text,
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    board_id: BOARD_ID,
    position,
    parent_id: null,
    done_at: null,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    client_request_id: `crid-${id}`,
    created_at: created,
    updated_at: created,
    ...extra,
  };
}

const sub = (base: number, id: string, parent: string, text: string, position: number, extra: Partial<Note> = {}) =>
  note(base, id, text, position, { parent_id: parent, ...extra });

const VOICE = `${COMPANY}/${DIRECTOR}/voice.m4a`;

/** A planning meeting: five points, branches of 0–4, one ticked, one handed over, one heard by voice. */
function planning(base: number): Note[] {
  const done = new Date(base - 12 * MIN).toISOString();
  return [
    note(base, "p1", "Продажи Q4: план и отчёт", 1, { audio_path: VOICE, raw_transcript: "Продажи Q4 план и отчёт" }),
    sub(base, "p1a", "p1", "План по регионам до пятницы", 1),
    sub(base, "p1b", "p1", "Отчёт по сделкам сентября", 2, { done_at: done }),
    sub(base, "p1c", "p1", "Созвон с Алматы во вторник", 3, { audio_path: VOICE }),
    note(base, "p2", "Найм: два менеджера до ноября", 2),
    sub(base, "p2a", "p2", "Вакансия на hh — обновить текст", 1),
    sub(base, "p2b", "p2", "Собеседования в среду и четверг", 2, { converted_task_id: "t-1" }),
    note(base, "p3", "Офис: переезд на пятый этаж", 3, { done_at: done }),
    note(base, "p4", "Склад в Актобе — аренда до конца года", 4),
    sub(base, "p4a", "p4", "Сравнить три предложения", 1),
    sub(base, "p4b", "p4", "Юрист смотрит договор", 2),
    sub(base, "p4c", "p4", "Ключи — у завхоза", 3),
    sub(base, "p4d", "p4", "Охрана с 1 ноября", 4),
    sub(base, "p4e", "p4", "Страховка склада", 5),
    note(base, "p5", "Корпоратив в декабре", 5, { converted_task_id: "t-2" }),
  ];
}

const MANY_TOPICS = [
  "Продажи Q4",
  "Найм менеджеров",
  "Переезд офиса",
  "Аренда склада",
  "Корпоратив",
  "Бюджет на рекламу",
  "Новый сайт",
  "Отчёт инвестору",
  "Закупка ноутбуков",
  "Обучение продавцов",
  "Скидки для оптовиков",
  "Логистика в Атырау",
  "Налоговая проверка",
  "Сертификация ISO",
  "CRM: перенос базы",
  "Колл-центр",
  "Возвраты по браку",
  "Выставка в Алматы",
  "Премии за квартал",
  "Мерч для клиентов",
  "Ремонт переговорной",
  "Договор с банком",
  "Курьерская служба",
  "Тендер на кровлю",
  "Охрана труда",
  "Инвентаризация",
  "Отпуска в декабре",
  "Сервер и бэкапы",
  "Партнёры в Шымкенте",
  "План на 2027",
];

export function buildBoard(which: BoardCase, now: Date): BoardFixture {
  const base = now.getTime();
  const none: Omit<BoardFixture, "title" | "rows"> = { phone: [], owed: [], late: [], online: true, hearing: [], wall: { onWall: false, spot: null } };
  switch (which) {
    case "empty":
      return { ...none, title: "Доска · 26 сент.", rows: [] };
    case "few":
      return {
        ...none,
        title: "Планёрка в понедельник",
        rows: [
          note(base, "p1", "Продажи Q4: план и отчёт", 1),
          note(base, "p2", "Найм: два менеджера до ноября", 2, { done_at: new Date(base - 5 * MIN).toISOString() }),
          note(base, "p3", "Офис: переезд на пятый этаж", 3),
        ],
      };
    case "branches":
    case "onwall":
    case "recording":
      return {
        ...none,
        title: "Планёрка в понедельник",
        rows: [
          ...planning(base),
          // a voice point being heard right now, and one STT did not catch
          note(base, "p6", "", 6, { audio_path: VOICE }),
          ...(which === "branches" ? [note(base, "p7", "", 7, { audio_path: VOICE })] : []),
        ],
        hearing: ["p6"],
        wall: which === "onwall" ? { onWall: true, spot: "p2" } : none.wall,
      };
    case "many":
      return {
        ...none,
        title: "Стратегическая сессия",
        rows: MANY_TOPICS.flatMap((topic, index) => {
          const id = `m${index + 1}`;
          const point = note(base, id, topic, index + 1, index % 7 === 3 ? { done_at: new Date(base - MIN).toISOString() } : {});
          const kids =
            index % 4 === 0
              ? [sub(base, `${id}a`, id, "Ответственный и срок", 1), sub(base, `${id}b`, id, "Бюджет", 2)]
              : index % 5 === 1
                ? [sub(base, `${id}a`, id, "Что мешает", 1)]
                : [];
          return [point, ...kids];
        }),
      };
    case "long":
      return {
        ...none,
        title:
          "Стратегическая сессия руководителей отделов по итогам третьего квартала и планам на четвёртый квартал две тысячи двадцать шестого",
        rows: [
          note(
            base,
            "l1",
            "Продажи четвёртого квартала: собрать с каждого регионального менеджера план по сделкам с разбивкой по месяцам, сверить с прошлогодними цифрами, отдельно выделить крупных клиентов из Атырау и Шымкента, по которым мы в сентябре потеряли объёмы, и к пятнице принести мне сводную таблицу с комментариями",
            1,
          ),
          sub(
            base,
            "l1a",
            "l1",
            "Региональные менеджеры присылают свои планы до среды, в одной таблице, с разбивкой по месяцам и по ключевым клиентам, без пересказа в мессенджере",
            1,
          ),
          sub(base, "l1b", "l1", "Атырау и Шымкент — отдельной строкой", 2),
          note(base, "l2", "Найм", 2),
          note(base, "l3", "Переезд офиса на пятый этаж\nКлючи у завхоза, грузчики в субботу к девяти, мебель старую — на склад", 3),
        ],
      };
    case "offline":
      // no network: a point said by voice waits on the phone, text lines under it and a typed point wait too
      return {
        ...none,
        title: "Планёрка в понедельник",
        rows: [
          note(base, "p1", "Продажи Q4: план и отчёт", 1),
          sub(base, "p1a", "p1", "План по регионам до пятницы", 1),
          note(base, "p2", "", 2),
          sub(base, "p2a", "p2", "Позвонить поставщику бетона", 1),
          note(base, "p3", "Офис: переезд на пятый этаж", 3),
        ],
        phone: ["p2"],
        owed: ["p2", "p2a", "p3"],
        late: ["p2", "p2a", "p3"],
        online: false,
      };
    case "waits":
      // the network is back, a voice point is still on the phone: its sub-points wait for it, not for the network
      return {
        ...none,
        title: "Планёрка в понедельник",
        rows: [
          note(base, "p1", "Продажи Q4: план и отчёт", 1),
          note(base, "p2", "", 2),
          sub(base, "p2a", "p2", "Позвонить поставщику бетона", 1),
          sub(base, "p2b", "p2", "", 2),
        ],
        phone: ["p2", "p2b"],
        owed: ["p2", "p2a", "p2b"],
        late: ["p2", "p2a", "p2b"],
      };
  }
}

/** The wall row of a board on the wall till 21:00, the presenter on `spot`. */
export function wallRow(now: Date, spot: string | null): TvState {
  const until = new Date(now.getTime() + 3 * 3_600_000).toISOString();
  return {
    applied_version: 1,
    awake_until: null,
    board_guest: false,
    board_id: BOARD_ID,
    board_point: spot,
    board_until: until,
    board_view: "list",
    calendar_view: "week",
    carousel: false,
    clock_style: "digital",
    company_id: COMPANY,
    employee_id: null,
    expires_at: null,
    guest: false,
    guest_until: null,
    mode: "idle",
    rating_view: "week",
    reload_requested_at: null,
    scene: "board",
    seen_at: now.toISOString(),
    task_id: null,
    updated_at: now.toISOString(),
    updated_by: DIRECTOR,
    version: 1,
  };
}
