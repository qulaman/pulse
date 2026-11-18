import { describe, expect, it } from "vitest";

import type { TvState } from "./queries";
import {
  SCENE_LABEL,
  WALL_SCENE_LABEL,
  keyLabels,
  likelyNow,
  overlayLine,
  uncover,
  wallHealth,
  wallNow,
  wallReceipt,
  wallScaleOf,
} from "./remote";

const NOW = new Date("2026-09-18T09:00:00Z"); // пятница, 14:00 в Актобе

/** The row as a database older than D-182 sends it: no `scene_set_at`, `scale`, `health`. */
function state(patch: Partial<TvState> & Record<string, unknown> = {}): TvState {
  return {
    company_id: "11111111-1111-1111-1111-111111111111",
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

const PEOPLE = [{ id: "e1", full_name: "Марат Ахметов" }];

describe("wallReceipt", () => {
  it("экран показал последнюю команду — «На стене»", () => {
    expect(wallReceipt(state(), NOW)).toEqual({ tone: "ok", text: "На стене" });
  });

  it("строки нет — экран ещё не подключался", () => {
    expect(wallReceipt(null, NOW).tone).toBe("muted");
    expect(wallReceipt(null, NOW).text).toBe("Экран ещё не подключался");
  });

  it("квитанции нет вовсе — тоже «ещё не подключался», а не «не отвечает»", () => {
    expect(wallReceipt(state({ seen_at: null, applied_version: null }), NOW).text).toBe("Экран ещё не подключался");
  });

  it("молчит дольше трёх минут — называет время и предлагает перезапуск", () => {
    const row = state({ seen_at: "2026-09-18T04:14:00Z" }); // 09:14 в Актобе
    expect(wallReceipt(row, NOW)).toEqual({ tone: "warn", text: "Экран не отвечает с 09:14", restart: true });
  });

  it("команда ушла, но экран её ещё не показал", () => {
    const row = state({ version: 5, applied_version: 4 });
    expect(wallReceipt(row, NOW)).toEqual({ tone: "muted", text: "Отправлено, экран ещё не показал" });
  });

  describe("квитанция за 15 секунд (D-182)", () => {
    const row = state({ version: 5, applied_version: 4 });

    it("своя команда не показана 15 с — спрашивает про телевизор и предлагает перезапуск", () => {
      expect(wallReceipt(row, NOW, { version: 5, at: NOW.getTime() - 15_000 })).toEqual({
        tone: "warn",
        text: "Экран не показал за 15 с — телевизор выключен или без сети?",
        restart: true,
      });
    });

    it("первые 15 с — ещё «отправлено»", () => {
      expect(wallReceipt(row, NOW, { version: 5, at: NOW.getTime() - 14_000 }).text).toBe("Отправлено, экран ещё не показал");
    });

    it("свою экран показал, новая пришла с другого устройства — «отправлено», не тревога", () => {
      expect(wallReceipt(row, NOW, { version: 4, at: NOW.getTime() - 60_000 }).text).toBe("Отправлено, экран ещё не показал");
    });

    it("показал — «На стене», сколько бы ни прошло", () => {
      expect(wallReceipt(state({ version: 5, applied_version: 5 }), NOW, { version: 5, at: NOW.getTime() - 60_000 }).text).toBe("На стене");
    });

    it("молчит три минуты — общее «не отвечает с …» важнее", () => {
      expect(wallReceipt(state({ version: 5, applied_version: 4, seen_at: "2026-09-18T04:14:00Z" }), NOW, { version: 5, at: NOW.getTime() - 60_000 }).text).toBe(
        "Экран не отвечает с 09:14",
      );
    });
  });
});

describe("wallHealth (D-182)", () => {
  it("звук заблокирован (Chrome без флага автозвука) — одна строка", () => {
    expect(wallHealth(state({ health: { sound: "suspended", wake: "on" } }), NOW)).toBe("Звук на экране заблокирован — звонка о посетителе не будет");
    expect(wallHealth(state({ health: { sound: "idle", silent_rings: 1, wake: "on" } }), NOW)).toMatch(/^Звук/);
  });

  it("экран засыпает", () => {
    for (const wake of ["off", "denied", "unsupported"]) {
      expect(wallHealth(state({ health: { sound: "running", wake } }), NOW)).toBe("Экран может уснуть сам — проверьте сон в настройках телевизора");
    }
  });

  it("звук важнее сна", () => {
    expect(wallHealth(state({ health: { sound: "suspended", wake: "off" } }), NOW)).toMatch(/^Звук/);
  });

  it("всё в порядке, звонка ещё не было, поле незнакомо, база старше, экран молчит — ничего", () => {
    expect(wallHealth(state({ health: { sound: "running", wake: "on", silent_rings: 0 } }), NOW)).toBeNull();
    expect(wallHealth(state({ health: { sound: "idle", wake: "on", silent_rings: 0 } }), NOW)).toBeNull();
    expect(wallHealth(state({ health: { foo: 1 } }), NOW)).toBeNull();
    expect(wallHealth(state(), NOW)).toBeNull();
    expect(wallHealth(state({ health: { sound: "suspended" }, seen_at: "2026-09-18T04:14:00Z" }), NOW)).toBeNull();
    expect(wallHealth(null, NOW)).toBeNull();
  });
});

describe("wallScaleOf", () => {
  it("100 | 115 | 130, незнакомое — 100", () => {
    expect(wallScaleOf(state({ scale: 115 }))).toBe(115);
    expect(wallScaleOf(state({ scale: 130 }))).toBe(130);
    expect(wallScaleOf(state({ scale: 120 }))).toBe(100);
    expect(wallScaleOf(state())).toBe(100);
    expect(wallScaleOf(null)).toBe(100);
  });
});

describe("wallNow — что на стене и почему (D-182)", () => {
  it("человек — «ещё 7 мин», слова «Эфир» нет", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T09:07:00Z" });
    expect(wallNow(row, PEOPLE, NOW)).toEqual({ title: "Марат Ахметов", why: "Человек на стене — ещё 7 мин" });
  });

  it("одно дело (D-123)", () => {
    const row = state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T09:07:00Z" });
    expect(wallNow(row, PEOPLE, NOW, [], { taskTitle: "Замер окон" })).toEqual({ title: "Дело «Замер окон»", why: "Дело на стене — ещё 7 мин" });
    expect(wallNow(row, PEOPLE, NOW).title).toBe("Одно дело");
  });

  it("истёкший фокус — уже заставка", () => {
    const row = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T08:55:00Z", carousel: true });
    expect(wallNow(row, PEOPLE, NOW).title).not.toContain("Марат");
  });

  it("днём по кругу: сцена и что дальше", () => {
    // 14:00 — круг с 10:00, шаг 80 → лицо; в 14:03 — рейтинг
    expect(wallNow(state({ carousel: true }), PEOPLE, NOW)).toEqual({ title: "Лицо", why: "Заставки по кругу · дальше — рейтинг в 14:03" });
    // без очков рейтинга в круге нет
    // (шаг 80 из трёх сцен — команда, дальше лицо)
    expect(wallNow(state({ carousel: true }), PEOPLE, NOW, [], { points: false })).toEqual({ title: "Команда", why: "Заставки по кругу · дальше — лицо в 14:03" });
  });

  it("утро программы — календарь «сегодня», дальше по кругу в 10:00", () => {
    const morning = new Date("2026-09-17T03:30:00Z"); // четверг, 08:30
    expect(wallNow(state({ carousel: true }), PEOPLE, morning)).toEqual({ title: "Календарь · сегодня", why: "Программа: утро · дальше по кругу в 10:00" });
  });

  it("понедельник: первый час утра — рейтинг недели, потом календарь", () => {
    const monday = new Date("2026-09-21T03:30:00Z"); // понедельник, 08:30
    expect(wallNow(state({ carousel: true }), PEOPLE, monday)).toEqual({ title: "Рейтинг недели", why: "Программа: утро · дальше — календарь в 09:00" });
  });

  it("вечер — «Итог дня» первым", () => {
    const evening = new Date("2026-09-17T12:00:00Z"); // четверг, 17:00
    expect(wallNow(state({ carousel: true }), PEOPLE, evening)).toEqual({ title: "Итог дня", why: "Программа: вечер · дальше — лицо в 17:03" });
  });

  it("объявление дня — первым в круге, его подпись", () => {
    const at = new Date("2026-09-17T05:00:00Z"); // четверг, 10:00 — первый шаг круга
    expect(wallNow(state({ carousel: true }), PEOPLE, at, [], { announcement: true }).title).toBe("Объявление");
  });

  it("ручная заставка держится до конца отрезка, потом программа", () => {
    const row = state({ scene: "clock", carousel: false, scene_set_at: "2026-09-18T08:30:00Z" }); // поставили в 13:30
    expect(wallNow(row, PEOPLE, NOW)).toEqual({ title: "Часы", why: "Вручную до 17:00, потом программа" });
    // поставили утром — днём уже программа
    const old = state({ scene: "clock", carousel: false, scene_set_at: "2026-09-18T03:30:00Z" });
    expect(wallNow(old, PEOPLE, NOW).why).toMatch(/^Заставки по кругу/);
  });

  it("база старше программы: ручная заставка держится, как всегда", () => {
    expect(wallNow(state({ scene: "team" }), PEOPLE, NOW)).toEqual({ title: "Команда", why: "Вручную · «По кругу» вернёт программу" });
    expect(wallNow(state({ scene: "calendar", calendar_view: "month" }), PEOPLE, NOW).title).toBe("Календарь · месяц");
    expect(wallNow(state({ scene: "calendar" }), PEOPLE, NOW).title).toBe("Календарь · неделя");
    expect(wallNow(state({ scene: "rating" }), PEOPLE, NOW).title).toBe("Рейтинг недели");
    expect(wallNow(state({ scene: "rating", rating_view: "month" }), PEOPLE, NOW).title).toBe("Рейтинг месяца");
    // очки выключены — на стене лицо, и пульт говорит то же
    expect(wallNow(state({ scene: "rating" }), PEOPLE, NOW, [], { points: false }).title).toBe("Лицо");
  });

  it("ночью спящая стена — тусклые часы до утра; разбуженная — сцена и до скольки (D-105)", () => {
    const night = new Date("2026-09-18T17:00:00Z"); // 22:00 в Актобе
    expect(wallNow(state({ scene: "team" }), PEOPLE, night)).toEqual({ title: "Ночь · тусклые часы", why: "До 08:00, потом программа дня" });
    expect(wallNow(state({ scene: "team", awake_until: "2026-09-18T19:00:00Z" }), PEOPLE, night)).toEqual({ title: "Команда", why: "Разбужен до 00:00, потом ночь" });
    // человек на стене ночь перебивает и без пульта
    const focus = state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T17:07:00Z" });
    expect(wallNow(focus, PEOPLE, night).title).toBe("Марат Ахметов");
  });

  it("окно ночи компании: в 21:30 при ночи с 22:00 — ещё вечер", () => {
    const at = new Date("2026-09-17T16:30:00Z"); // четверг, 21:30
    const w = { nightFrom: 22 * 60, nightTo: 7 * 60, eveningFrom: 18 * 60 };
    expect(wallNow(state({ carousel: true }), PEOPLE, at, [], { window: w }).why).toMatch(/^Программа: вечер/);
    expect(wallNow(state({ carousel: true }), PEOPLE, at).title).toBe("Ночь · тусклые часы");
  });

  describe("доска (D-102, D-121)", () => {
    const BOARDS = [{ id: "b-1", title: "Планёрка" }];
    const POINTS = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
    const onWall = (patch: Partial<TvState> = {}) => state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T16:00:00Z", ...patch });

    it("название, пункт и до скольки", () => {
      expect(wallNow(onWall({ board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toEqual({ title: "Доска «Планёрка»", why: "Пункт 3 из 7 · до 21:00" });
      expect(wallNow(onWall(), PEOPLE, NOW, BOARDS, { boardPoints: POINTS })).toEqual({ title: "Доска «Планёрка»", why: "До 21:00" });
      expect(wallNow(onWall(), PEOPLE, NOW).title).toBe("Доска");
      // подсвеченного пункта уже нет на доске — стена его не светит, и пульт не называет
      expect(wallNow(onWall({ board_point: "gone" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS }).why).toBe("До 21:00");
    });

    it("карта — только когда она влезает на стену", () => {
      expect(wallNow(onWall({ board_view: "map", board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS }).why).toBe("Карта · пункт 3 из 7 · до 21:00");
      const many = Array.from({ length: 13 }, (_, i) => `p${i + 1}`);
      expect(wallNow(onWall({ board_view: "map" }), PEOPLE, NOW, BOARDS, { boardPoints: many }).why).toBe("До 21:00");
    });

    it("при госте без «Показать гостю» — скрыта (D-102 §7)", () => {
      expect(wallNow(onWall({ guest: true }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS }).why).toBe("Скрыта от гостя — на стене часы · до 21:00");
      expect(wallNow(onWall({ guest: true, board_guest: true, board_point: "p3" }), PEOPLE, NOW, BOARDS, { boardPoints: POINTS }).why).toBe("Пункт 3 из 7 · до 21:00");
    });

    it("длинное название режется", () => {
      const long = [{ id: "b-1", title: "Совещание по новому складу и логистике  на октябрь" }];
      expect(wallNow(onWall(), PEOPLE, NOW, long).title).toBe("Доска «Совещание по новому скл…»");
    });

    it("истёкшая доска — программа", () => {
      expect(wallNow(state({ scene: "board", board_id: "b-1", board_until: "2026-09-18T08:00:00Z" }), PEOPLE, NOW).why).toMatch(/^Заставки по кругу/);
    });

    it("доска недели в круге (D-144)", () => {
      // 10:12 четверга — шаг 4 круга из пяти: доска недели
      const at = new Date("2026-09-17T05:12:00Z");
      const row = state({ carousel: true, week_board_id: "b-1", week_board_until: "2026-09-20T16:00:00Z" });
      expect(wallNow(row, PEOPLE, at, BOARDS).title).toBe("Доска недели «Планёрка»");
    });
  });
});

describe("overlayLine — что поверх всего и до каких пор (D-182)", () => {
  const at = (iso: string) => ({ status: "waiting", created_at: iso, answered_at: null });

  it("посетитель — уйдёт через 20 минут после прихода", () => {
    expect(overlayLine(at("2026-09-18T08:55:00Z"), null, NOW)).toBe("Надпись о посетителе — уйдёт в 14:15");
    expect(overlayLine(at("2026-09-18T08:30:00Z"), null, NOW)).toBe("Надпись о посетителе — уйдёт после ответа");
  });

  it("сообщение — через 30 минут; посетитель важнее", () => {
    expect(overlayLine(null, at("2026-09-18T08:55:00Z"), NOW)).toBe("Сообщение секретаря — уйдёт в 14:25");
    expect(overlayLine(null, at("2026-09-18T08:00:00Z"), NOW)).toBe("Сообщение секретаря — уйдёт после «Понятно»");
    expect(overlayLine(at("2026-09-18T08:55:00Z"), at("2026-09-18T08:55:00Z"), NOW)).toMatch(/^Надпись о посетителе/);
  });

  it("«Подождёт» — плашка на час от ответа", () => {
    expect(overlayLine({ status: "wait", created_at: "2026-09-18T08:40:00Z", answered_at: "2026-09-18T08:50:00Z" }, null, NOW)).toBe("Плашка «Посетитель ждёт» — уйдёт в 14:50");
    // сообщение поверх плашки важнее
    expect(overlayLine({ status: "wait", created_at: "2026-09-18T08:40:00Z", answered_at: "2026-09-18T08:50:00Z" }, at("2026-09-18T08:55:00Z"), NOW)).toMatch(/^Сообщение/);
  });

  it("ничего поверх — null", () => {
    expect(overlayLine(null, null, NOW)).toBeNull();
  });
});

describe("likelyNow — «Вероятно сейчас» (D-182)", () => {
  const ROSTER = ["dir", "a", "b", "c", "d", "e", "tv"].map((id) => ({ id, role: id === "tv" ? "tv" : id === "dir" ? "director" : "employee", is_active: true }));
  const meeting = (patch: Record<string, unknown> = {}) => ({
    starts_at: "2026-09-18T08:30:00Z",
    ends_at: "2026-09-18T09:30:00Z",
    author_id: "dir",
    cancelled_at: null,
    participants: [
      { user_id: "dir", status: "accepted" },
      { user_id: "a", status: "accepted" },
      { user_id: "b", status: "declined" },
      { user_id: "c", status: "invited" },
    ],
    ...patch,
  });
  const base = { meId: "dir", events: [], tasks: [], shownToday: [], people: ROSTER, now: NOW };

  it("участники идущей встречи директора, без отказавшихся и без него самого", () => {
    expect(likelyNow({ ...base, events: [meeting()] })).toEqual([
      { id: "a", why: "meeting" },
      { id: "c", why: "meeting" },
    ]);
  });

  it("встреча без конца — час (D-180); прошедшая, отменённая и чужая — нет", () => {
    expect(likelyNow({ ...base, events: [meeting({ ends_at: null, starts_at: "2026-09-18T08:10:00Z" })] }).length).toBe(2);
    expect(likelyNow({ ...base, events: [meeting({ ends_at: null, starts_at: "2026-09-18T07:30:00Z" })] })).toEqual([]);
    expect(likelyNow({ ...base, events: [meeting({ cancelled_at: "2026-09-18T08:00:00Z" })] })).toEqual([]);
    const theirs = meeting({ author_id: "d", participants: [{ user_id: "a", status: "accepted" }] });
    expect(likelyNow({ ...base, events: [theirs] })).toEqual([]);
    // приглашён директор — его встреча, автор тоже в кабинете
    const asked = meeting({ author_id: "d", participants: [{ user_id: "dir", status: "accepted" }, { user_id: "a", status: "accepted" }] });
    expect(likelyNow({ ...base, events: [asked] }).map((entry) => entry.id)).toEqual(["d", "a"]);
  });

  it("дальше — чьё дело ждёт приёмки, потом кого показывали сегодня; каждый один раз, не больше четырёх", () => {
    const tasks = [
      { status: "pending_review", assignee_id: "e" },
      { status: "accepted", assignee_id: "d" },
      { status: "pending_review", assignee_id: "a" },
    ];
    expect(likelyNow({ ...base, events: [meeting()], tasks, shownToday: ["d", "e", "b"] })).toEqual([
      { id: "a", why: "meeting" },
      { id: "c", why: "meeting" },
      { id: "e", why: "review" },
      { id: "d", why: "shown" },
    ]);
  });

  it("экран, ушедший и незнакомый — не люди пульта", () => {
    const people = ROSTER.map((person) => (person.id === "e" ? { ...person, is_active: false } : person));
    expect(likelyNow({ ...base, people, shownToday: ["tv", "e", "zz", "b"] })).toEqual([{ id: "b", why: "shown" }]);
  });
});

describe("подписи", () => {
  it("SCENE_LABEL — клавиши сцен", () => {
    expect(SCENE_LABEL).toEqual({ face: "Лицо", clock: "Часы", team: "Команда", calendar: "Календарь", board: "Доска", rating: "Рейтинг" });
  });

  it("новые сцены программы — на дисплее по-русски", () => {
    expect(WALL_SCENE_LABEL["day-result"]).toBe("Итог дня");
    expect(WALL_SCENE_LABEL["week-result"]).toBe("Итог недели");
    expect(WALL_SCENE_LABEL.announcement).toBe("Объявление");
    expect(WALL_SCENE_LABEL.welcome).toBe("Приветствие");
  });
});

describe("keyLabels", () => {
  it("подписывает клавишу именем, тёзок — с буквой фамилии", () => {
    const labels = keyLabels([
      { id: "a", full_name: "Ерлан Байжанов" },
      { id: "b", full_name: "Ерлан Досов" },
      { id: "c", full_name: "Марат Оспанов" },
      { id: "d", full_name: "Айгуль" },
    ]);
    expect(labels.get("a")).toBe("Ерлан Б.");
    expect(labels.get("b")).toBe("Ерлан Д.");
    expect(labels.get("c")).toBe("Марат");
    expect(labels.get("d")).toBe("Айгуль");
  });
});

describe("uncover — заставка с пульта снимает человека и дело", () => {
  it("человек или дело на стене — команда возвращает заставки", () => {
    expect(uncover(state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T09:05:00Z" }), NOW)).toEqual({ mode: "ether" });
    expect(uncover(state({ mode: "task", task_id: "t1", expires_at: "2026-09-18T09:05:00Z" }), NOW)).toEqual({ mode: "ether" });
  });

  it("заставка, истёкший фокус или нет строки — команда как была", () => {
    expect(uncover(state(), NOW)).toEqual({});
    expect(uncover(state({ mode: "employee", employee_id: "e1", expires_at: "2026-09-18T08:59:00Z" }), NOW)).toEqual({});
    expect(uncover(null, NOW)).toEqual({});
  });
});
