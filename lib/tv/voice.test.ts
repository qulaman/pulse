import { describe, expect, it } from "vitest";

import { lineOf, type TvEvent } from "./feed";
import { speechOf } from "./voice";

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
  it("о свежем событии говорит в настоящем времени — глагол не выдаёт род", () => {
    const speech = speechOf([line("task_accepted", "2026-09-17T06:59:30Z")], TODAY, NOON);
    expect(speech.text).toBe("Марат Оспанов берёт в работу");
    expect(speech.mood).toBe("speaking");
  });

  it("доброму событию радуется, но никогда не огорчается", () => {
    expect(speechOf([line("task_done", "2026-09-17T06:59:30Z")], TODAY, NOON).mood).toBe("happy");
    expect(speechOf([line("points", "2026-09-17T06:59:30Z", "за срок", 5)], TODAY, NOON).text).toBe(
      "Марат Оспанов получает 5",
    );
  });

  it("без новостей молчит: числа дня едут в строке, под лицом — темп дня (D-182)", () => {
    const stale = speechOf([line("task_sent", "2026-09-17T05:00:00Z")], TODAY, NOON);
    expect(stale.text).toBeNull();
    expect(stale.mood).toBe("calm");
    expect(speechOf([], { sent: 0, done: 0, in_work: 0 }, NOON).text).toBeNull();
  });

  it("ночью в тишине засыпает, но днём в тишине — нет", () => {
    const night = new Date("2026-09-17T18:00:00Z"); // 23:00 в Актобе
    expect(speechOf([line("task_sent", "2026-09-17T14:00:00Z")], TODAY, night).mood).toBe("sleeping");
    expect(speechOf([line("task_sent", "2026-09-17T02:00:00Z")], TODAY, NOON).mood).toBe("calm");
  });

  it("ночь — то же окно, что у стены: 21:30 уже ночь, своё окно компании — своё", () => {
    const evening = new Date("2026-09-17T16:30:00Z"); // 21:30 в Актобе
    const quiet = [line("task_sent", "2026-09-17T15:00:00Z")];
    expect(speechOf(quiet, TODAY, evening).mood).toBe("sleeping");
    // the company's night starts at 23:00: at 21:30 the face is awake
    expect(speechOf(quiet, TODAY, evening, { nightFrom: 23 * 60, nightTo: 7 * 60, eveningFrom: 18 * 60 }).mood).toBe("calm");
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
    expect(speechOf([guest], TODAY, NOON).text).toBe("Марат получает очки");
  });

  it("о мероприятии лицо говорит «Скоро», а гостю — обезличенно", () => {
    const meeting = {
      id: "e1",
      kind: "event" as const,
      created_at: "2026-09-17T06:59:30Z",
      payload: { name: null, title: "Планёрка", amount: null },
      payload_guest: { name: null, title: null, amount: null },
    };
    expect(speechOf([lineOf(meeting, false)], TODAY, NOON).text).toBe("Скоро — «Планёрка»");
    expect(speechOf([lineOf(meeting, true)], TODAY, NOON).text).toBe("Скоро — мероприятие");
  });
});
