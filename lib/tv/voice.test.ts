import { describe, expect, it } from "vitest";

import { lineOf, type TvEvent } from "./feed";
import { greetingOf, PHRASE_MAX, phraseOf, speechOf } from "./voice";

const TODAY = { sent: 5, done: 2, in_work: 3 };

function line(kind: TvEvent["kind"], at: string, title: string | null = "Подписать акт", amount: number | null = null) {
  return lineOf(
    {
      id: `${kind}-${at}`,
      kind,
      created_at: at,
      payload: { name: "Марат Оспанов", title, amount },
      payload_guest: { name: "Марат", title: null, amount: null },
    },
    false,
  );
}

const NOON = new Date("2026-09-17T07:00:00Z"); // 12:00 в Актобе

describe("speechOf", () => {
  it("о свежем событии — имя и двоеточие: ни глагол, ни падеж не выдают род", () => {
    const speech = speechOf([line("task_accepted", "2026-09-17T06:59:30Z")], TODAY, NOON);
    expect(speech.text).toBe("Марат Оспанов: в работе");
    expect(speech.mood).toBe("speaking");
  });

  it("доброму событию радуется, но никогда не огорчается", () => {
    expect(speechOf([line("task_done", "2026-09-17T06:59:30Z")], TODAY, NOON).mood).toBe("happy");
    expect(speechOf([line("points", "2026-09-17T06:59:30Z", "за срок", 5)], TODAY, NOON).text).toBe("Марат Оспанов: +5 очков");
  });

  it("когда новостей нет — здоровается, а не повторяет числа дня со сцены", () => {
    const stale = speechOf([line("task_sent", "2026-09-17T05:00:00Z")], TODAY, NOON);
    expect(stale.text).toBe("Добрый день");
    expect(stale.mood).toBe("calm");
  });

  it("пустой день не оставляет экран без слов", () => {
    expect(speechOf([], { sent: 0, done: 0, in_work: 0 }, NOON).text).toBe("Добрый день");
  });

  it("ночью в тишине засыпает, но днём в тишине — нет", () => {
    const night = new Date("2026-09-17T18:00:00Z"); // 23:00 в Актобе
    expect(speechOf([line("task_sent", "2026-09-17T14:00:00Z")], TODAY, night).mood).toBe("sleeping");
    expect(speechOf([line("task_sent", "2026-09-17T02:00:00Z")], TODAY, NOON).mood).toBe("calm");
  });

  it("у гостя в речи нет ни фамилии, ни цифр", () => {
    const guest = lineOf(
      {
        id: "g1",
        kind: "points",
        created_at: "2026-09-17T06:59:30Z",
        payload: { name: "Марат Оспанов", title: "за срок", amount: 5 },
        payload_guest: { name: "Марат", title: null, amount: null },
      },
      true,
    );
    expect(speechOf([guest], TODAY, NOON).text).toBe("Марат: похвала");
  });

  it("о мероприятии лицо говорит «Скоро», а гостю — обезличенно", () => {
    const meeting = {
      id: "e1",
      kind: "event" as const,
      created_at: "2026-09-17T06:59:30Z",
      payload: { name: null, title: "Планёрка", amount: null },
      payload_guest: { name: null, title: null, amount: null },
    };
    expect(speechOf([lineOf(meeting, false)], TODAY, NOON).text).toBe("Скоро: Планёрка");
    expect(speechOf([lineOf(meeting, true)], TODAY, NOON).text).toBe("Скоро встреча");
  });
});

describe("phraseOf — одна короткая фраза о событии (D-185)", () => {
  type Kind = TvEvent["kind"];
  const ALL: Kind[] = ["task_sent", "task_accepted", "task_review", "task_done", "points", "announcement", "merch", "event"];

  function said(kind: Kind, title: string | null = "Подписать акт", amount: number | null = null, name: string | null = "Марат", guest = false): string {
    return phraseOf(
      lineOf(
        {
          id: `${kind}-1`,
          kind,
          created_at: "2026-09-17T06:59:30Z",
          payload: { name, title, amount },
          payload_guest: { name: name?.split(" ")[0] ?? null, title: null, amount: null },
        },
        guest,
      ),
    );
  }

  it("поручение, работа и проверка — без названия: оно продиктовано одному человеку (D-45)", () => {
    expect(said("task_sent")).toBe("Марат: новая задача");
    expect(said("task_accepted")).toBe("Марат: в работе");
    expect(said("task_review")).toBe("Марат: на проверке");
    for (const kind of ["task_sent", "task_accepted", "task_review"] as const) {
      expect(said(kind, "Сверка с поставщиком")).not.toMatch(/Сверка|Подписать/);
      expect(said(kind, "Акт")).toBe(said(kind, null));
    }
  });

  it("принятая работа — с названием, только если оно влезает целиком", () => {
    expect(said("task_done", "Акт")).toBe("Марат: Акт");
    const room = PHRASE_MAX - "Марат Оспанов: ".length;
    const fits = "А".repeat(room);
    expect(said("task_done", fits, null, "Марат Оспанов")).toBe(`Марат Оспанов: ${fits}`);
    expect(said("task_done", fits, null, "Марат Оспанов")).toHaveLength(PHRASE_MAX);
    expect(said("task_done", `${fits}Б`, null, "Марат Оспанов")).toBe("Марат Оспанов: готово");
    expect(said("task_done", null)).toBe("Марат: готово");
  });

  it("очки — плюс, число и слово по числу; без числа — похвала", () => {
    expect(said("points", "за помощь", 10, "Айболат")).toBe("Айболат: +10 очков");
    expect([1, 3, 5, 11, 21, 22].map((n) => said("points", null, n, "Айболат"))).toEqual([
      "Айболат: +1 очко",
      "Айболат: +3 очка",
      "Айболат: +5 очков",
      "Айболат: +11 очков",
      "Айболат: +21 очко",
      "Айболат: +22 очка",
    ]);
    expect(said("points", "за помощь", null, "Айболат")).toBe("Айболат: похвала");
    // the reason is not said: it is the director's words to one person
    expect(said("points", "за помощь", 10, "Айболат")).not.toMatch(/помощь/);
  });

  it("объявление, награда и встреча — со словами, если влезают; иначе без них", () => {
    expect(said("announcement", "Завтра субботник")).toBe("Объявление: Завтра субботник");
    expect(said("announcement", "Я".repeat(PHRASE_MAX - "Объявление: ".length))).toHaveLength(PHRASE_MAX);
    expect(said("announcement", "Я".repeat(PHRASE_MAX - "Объявление: ".length + 1))).toBe("Новое объявление");
    expect(said("announcement", null)).toBe("Новое объявление");

    expect(said("merch", "Худи", null, "Айгерим")).toBe("Айгерим: награда «Худи»");
    const prize = "Я".repeat(PHRASE_MAX - "Айгерим: награда «»".length);
    expect(said("merch", prize, null, "Айгерим")).toBe(`Айгерим: награда «${prize}»`);
    expect(said("merch", prize, null, "Айгерим")).toHaveLength(PHRASE_MAX);
    expect(said("merch", `${prize}Я`, null, "Айгерим")).toBe("Айгерим: новая награда");
    expect(said("merch", null, null, "Айгерим")).toBe("Айгерим: новая награда");

    expect(said("event", "Планёрка", null, null)).toBe("Скоро: Планёрка");
    expect(said("event", "Я".repeat(PHRASE_MAX - "Скоро: ".length), null, null)).toHaveLength(PHRASE_MAX);
    expect(said("event", "Я".repeat(PHRASE_MAX - "Скоро: ".length + 1), null, null)).toBe("Скоро встреча");
    expect(said("event", null, null, null)).toBe("Скоро встреча");
  });

  it("длинное не режется: ни «…», ни обрывка, ни фразы длиннее PHRASE_MAX", () => {
    const long = "Подготовить коммерческое предложение для нового заказчика из Актобе";
    // longer than the feed's own limit: the feed shortens it with «…», the band must not show that
    const huge = `${long} ${long}`;
    for (const kind of ALL) {
      for (const title of [long, huge]) {
        const phrase = said(kind, title, kind === "points" ? 50 : null);
        expect(phrase.length).toBeLessThanOrEqual(PHRASE_MAX);
        expect(phrase).not.toMatch(/…|\.\.\./);
        expect(phrase).not.toMatch(/Подготовить|предложени|заказчик/);
      }
    }
  });

  it("гостю — без фамилии, названий и чисел (D-33)", () => {
    for (const kind of ALL) {
      const phrase = said(kind, "Сверка с поставщиком", kind === "points" ? 50 : null, "Марат Оспанов", true);
      expect(phrase).not.toMatch(/Оспанов|Сверка|\d/);
    }
    expect(said("points", "за помощь", 50, "Марат Оспанов", true)).toBe("Марат: похвала");
    expect(said("task_done", "Сверка", null, "Марат Оспанов", true)).toBe("Марат: готово");
  });

  it("негатива нет ни в одной фразе (D-45)", () => {
    for (const kind of ALL) {
      expect(said(kind, null, kind === "points" ? 5 : null)).not.toMatch(/просроч|опозд|отказ|не мож|доработ|возвра|в срок|штраф/i);
    }
  });
});

describe("greetingOf", () => {
  // hh:00 in Aqtobe (UTC+5) on 17 September
  const at = (hh: number) => new Date(Date.UTC(2026, 8, 17) + (hh - 5) * 3_600_000);

  it("по часам Актобе", () => {
    expect(greetingOf(at(8))).toBe("Доброе утро");
    expect(greetingOf(at(12))).toBe("Добрый день");
    expect(greetingOf(at(19))).toBe("Добрый вечер");
    expect(greetingOf(at(23))).toBe("Доброй ночи");
    expect(greetingOf(at(3))).toBe("Доброй ночи");
  });

  it("вечером после сделанного дня — спасибо", () => {
    expect(greetingOf(at(19), { done: 4 })).toBe("Спасибо за день");
    expect(greetingOf(at(12), { done: 4 })).toBe("Добрый день");
  });
});
