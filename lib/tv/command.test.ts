import { describe, expect, it } from "vitest";

import { parseWallCommand, wallInput, type WallContext } from "./command";
import type { TvState } from "./queries";

const NOW = new Date("2026-11-18T09:00:00Z"); // 14:00 в Актобе

const PEOPLE = [
  { id: "m1", full_name: "Марат Ахметов", aliases: ["Маратик"], role: "employee", is_active: true },
  { id: "e1", full_name: "Ерлан Бекмуханов", aliases: [], role: "employee", is_active: true },
  { id: "e2", full_name: "Ерлан Досов", aliases: [], role: "manager", is_active: true },
  { id: "d1", full_name: "Дина Касымова", aliases: ["Динара"], role: "secretary", is_active: true },
  { id: "tv", full_name: "Экран кабинет", aliases: [], role: "tv", is_active: true },
  { id: "gone", full_name: "Мария Старая", aliases: [], role: "employee", is_active: false },
];

const BOARDS = [
  { id: "b1", title: "Планёрка · понедельник" },
  { id: "b2", title: "Склад на октябрь" },
];

const CONTEXT: WallContext = { people: PEOPLE, boards: BOARDS, points: true };

const parse = (text: string, context: Partial<WallContext> = {}) => parseWallCommand(text, { ...CONTEXT, ...context });
const intents = (text: string, context: Partial<WallContext> = {}) => parse(text, context).map((command) => command.intent);

function state(patch: Partial<TvState> = {}): TvState {
  return {
    company_id: "c1",
    mode: "ether",
    employee_id: null,
    task_id: null,
    scene: "face",
    guest: false,
    guest_until: null,
    clock_style: "digital",
    calendar_view: "week",
    rating_view: "week",
    carousel: false,
    board_id: null,
    board_until: null,
    board_guest: false,
    board_point: null,
    board_view: "list",
    week_board_id: null,
    week_board_until: null,
    awake_until: null,
    expires_at: null,
    version: 1,
    reload_requested_at: null,
    seen_at: NOW.toISOString(),
    applied_version: 1,
    updated_by: null,
    updated_at: NOW.toISOString(),
    ...patch,
  } as TvState;
}

describe("parseWallCommand — человек на стену", () => {
  it("«покажи Марата на стене», «Марата на стену», «на стену Марат» — одно и то же", () => {
    for (const text of ["покажи Марата на стене", "Марата на стену", "на стену Марат", "Покажи-ка мне Марата на экране", "выведи Марата на телевизор"]) {
      expect(intents(text), text).toEqual([{ kind: "person", personId: "m1" }]);
    }
  });

  it("называет человека так же, как клавиша пульта, и говорит квитанцию", () => {
    expect(parse("Марата на стену")[0]).toMatchObject({ key: "person:m1", label: "На стену: Марат", done: "На стене — Марат · 10 мин", lead: true });
  });

  it("находит по кличке и по фамилии, в любом падеже", () => {
    expect(intents("Маратика на стену")).toEqual([{ kind: "person", personId: "m1" }]);
    expect(intents("Ахметова на стену")).toEqual([{ kind: "person", personId: "m1" }]);
    expect(intents("Дину на стену")).toEqual([{ kind: "person", personId: "d1" }]);
    expect(intents("Динару на стену")).toEqual([{ kind: "person", personId: "d1" }]);
  });

  it("тёзки — два кандидата, ни один не делается сам; буква фамилии решает", () => {
    const both = parse("Ерлана на стену");
    expect(both.map((command) => command.intent)).toEqual([
      { kind: "person", personId: "e1" },
      { kind: "person", personId: "e2" },
    ]);
    expect(both.map((command) => command.label)).toEqual(["На стену: Ерлан Б.", "На стену: Ерлан Д."]);
    expect(both.every((command) => !command.lead)).toBe(true);
    expect(parse("Ерлана Д на стену")).toMatchObject([{ intent: { kind: "person", personId: "e2" }, lead: true }]);
  });

  it("экран и ушедший — не люди стены", () => {
    expect(intents("Экран на стену")).toEqual([]);
    expect(intents("Марию на стену")).toEqual([]);
  });

  it("без стены — не команда: «покажи Марата» осталось поручением", () => {
    expect(intents("покажи Марата")).toEqual([]);
    expect(intents("Марат")).toEqual([]);
  });

  it("лишнее слово — это поручение, а не пульт", () => {
    expect(intents("Марат, повесь график на стену")).toEqual([]);
    expect(intents("Марату на стену повесить график")).toEqual([]);
    expect(intents("Марата и Дину на стену")).toEqual([]);
    expect(intents("незнакомец на стену")).toEqual([]);
  });

  it("слишком длинная фраза — поручение", () => {
    expect(intents("покажи пожалуйста на стене прямо сейчас в кабинете Марата Ахметова")).toEqual([]);
  });
});

describe("parseWallCommand — заставки", () => {
  it("часы, лицо, команда, календарь, рейтинг", () => {
    expect(intents("часы на стену")).toEqual([{ kind: "scene", scene: "clock" }]);
    expect(intents("лицо на стену")).toEqual([{ kind: "scene", scene: "face" }]);
    expect(intents("команду на стену")).toEqual([{ kind: "scene", scene: "team" }]);
    expect(intents("календарь на стену")).toEqual([{ kind: "scene", scene: "calendar" }]);
    expect(intents("покажи рейтинг на экране")).toEqual([{ kind: "scene", scene: "rating" }]);
    expect(parse("часы на стену")[0]).toMatchObject({ label: "На стену: часы", done: "Заставка: часы", lead: true });
  });

  it("месяц и неделя у календаря и рейтинга", () => {
    expect(intents("календарь на месяц на стену")).toEqual([{ kind: "scene", scene: "calendar", calendar: "month" }]);
    expect(intents("на стену календарь неделя")).toEqual([{ kind: "scene", scene: "calendar", calendar: "week" }]);
    expect(intents("рейтинг месяца на стену")).toEqual([{ kind: "scene", scene: "rating", rating: "month" }]);
    expect(parse("рейтинг месяца на стену")[0]).toMatchObject({ label: "На стену: рейтинг месяца", done: "На стене — рейтинг месяца" });
    // месяц у часов не бывает
    expect(intents("часы на месяц на стену")).toEqual([]);
  });

  it("рейтинг без очков — не команда (D-48)", () => {
    expect(intents("рейтинг на стену", { points: false })).toEqual([]);
  });

  it("две заставки сразу — не команда", () => {
    expect(intents("часы и календарь на стену")).toEqual([]);
  });

  it("«верни заставки», «заставки по кругу», «верни эфир» — круг", () => {
    for (const text of ["верни заставки", "Верните заставки на стену", "заставки по кругу", "верни эфир", "по кругу на стене"]) {
      expect(intents(text), text).toEqual([{ kind: "round" }]);
    }
    expect(parse("верни заставки")[0]).toMatchObject({ label: "Стена: заставки по кругу", lead: true });
  });
});

describe("parseWallCommand — доска", () => {
  it("«доску на стену» — первая живая доска директора", () => {
    expect(parse("доску на стену")).toMatchObject([{ intent: { kind: "board", boardId: "b1" }, label: "На стену: доска «Планёрка · понедельник»", lead: true }]);
  });

  it("по словам названия", () => {
    expect(intents("доску склад на стену")).toEqual([{ kind: "board", boardId: "b2" }]);
    expect(intents("на стену доску планерка")).toEqual([{ kind: "board", boardId: "b1" }]);
    expect(intents("доску бюджет на стену")).toEqual([]);
  });

  it("досок нет — команды нет", () => {
    expect(intents("доску на стену", { boards: [] })).toEqual([]);
  });
});

describe("parseWallCommand — убрать", () => {
  it("«убери со стены», «сними со стены» — убрать", () => {
    for (const text of ["убери со стены", "Сними с экрана", "убрать со стены", "убери часы со стены"]) {
      expect(intents(text), text).toEqual([{ kind: "clear" }]);
    }
  });

  it("с именем — только того, кто на стене", () => {
    expect(intents("убери Марата со стены", { onWallId: "m1" })).toEqual([{ kind: "clear" }]);
    expect(intents("убери Марата со стены", { onWallId: "d1" })).toEqual([]);
    expect(intents("убери Марата со стены")).toEqual([]);
  });

  it("«Ерлан, сними часы со стены» — поручение Ерлану", () => {
    expect(intents("Ерлан, сними часы со стены")).toEqual([]);
  });
});

describe("parseWallCommand — не команды", () => {
  it("пусто, одна стена, раздел «Экран»", () => {
    expect(intents("")).toEqual([]);
    expect(intents("на стену")).toEqual([]);
    expect(intents("открой экран")).toEqual([]);
    expect(intents("экран")).toEqual([]);
  });
});

describe("wallInput", () => {
  it("человек — на 10 минут, что бы ни было на стене", () => {
    expect(wallInput({ kind: "person", personId: "m1" }, state(), NOW)).toEqual({ mode: "employee", employeeId: "m1" });
  });

  it("заставка при человеке на стене снимает его той же командой (uncover)", () => {
    const covered = state({ mode: "employee", employee_id: "m1", expires_at: "2026-11-18T09:05:00Z" });
    expect(wallInput({ kind: "scene", scene: "clock" }, covered, NOW)).toEqual({ mode: "ether", scene: "clock" });
    expect(wallInput({ kind: "scene", scene: "clock" }, state(), NOW)).toEqual({ scene: "clock" });
    expect(wallInput({ kind: "scene", scene: "calendar", calendar: "month" }, state(), NOW)).toEqual({ scene: "calendar", calendar: "month" });
    expect(wallInput({ kind: "scene", scene: "rating", rating: "week" }, state(), NOW)).toEqual({ scene: "rating", rating: "week" });
  });

  it("стена неизвестна (компьютер вне «Экрана») — снимает на всякий случай", () => {
    expect(wallInput({ kind: "scene", scene: "team" }, null, NOW)).toEqual({ mode: "ether", scene: "team" });
    expect(wallInput({ kind: "board", boardId: "b1" }, undefined, NOW)).toEqual({ mode: "ether", board: "b1" });
    expect(wallInput({ kind: "round" }, null, NOW)).toEqual({ mode: "ether", carousel: true });
  });

  it("доска и круг", () => {
    expect(wallInput({ kind: "board", boardId: "b1" }, state(), NOW)).toEqual({ board: "b1" });
    expect(wallInput({ kind: "round" }, state(), NOW)).toEqual({ carousel: true });
  });

  it("убрать: человека — только его; иначе — назад к заставкам по кругу", () => {
    const covered = state({ mode: "task", task_id: "t1", expires_at: "2026-11-18T09:05:00Z" });
    expect(wallInput({ kind: "clear" }, covered, NOW)).toEqual({ mode: "ether" });
    expect(wallInput({ kind: "clear" }, state({ scene: "board", board_id: "b1", board_until: "2026-11-18T16:00:00Z" }), NOW)).toEqual({ mode: "ether", carousel: true });
    expect(wallInput({ kind: "clear" }, null, NOW)).toEqual({ mode: "ether", carousel: true });
  });
});

describe("matchWallCommands — палитра компьютера (Ctrl K)", () => {
  it("те же команды, люди — из команды палитры", async () => {
    const { matchWallCommands } = await import("@/lib/desk/palette");
    expect(matchWallCommands("Марата на стену", PEOPLE, { boards: BOARDS }).map((command) => command.key)).toEqual(["person:m1"]);
    expect(matchWallCommands("смета Ерлану до пятницы", PEOPLE)).toEqual([]);
  });
});
