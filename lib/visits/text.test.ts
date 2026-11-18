import { describe, expect, it } from "vitest";

import {
  awaitingDirector,
  closeLabel,
  reception,
  recentNotes,
  statusLine,
  statusTone,
  unreadMessages,
  waitedSince,
  wallLine,
  type VisitLike,
} from "./text";

const NOW = new Date("2026-09-25T09:00:00Z");

function visit(patch: Partial<VisitLike> & Pick<VisitLike, "id">): VisitLike {
  return {
    kind: "visitor",
    status: "waiting",
    note: null,
    created_at: "2026-09-25T08:55:00Z",
    answered_at: null,
    shown_at: null,
    closed_at: null,
    ...patch,
  };
}

describe("awaitingDirector", () => {
  it("сначала без ответа и раньше пришедшие; решённые и убранные — нет", () => {
    const list = awaitingDirector([
      visit({ id: "late", created_at: "2026-09-25T08:58:00Z" }),
      visit({ id: "early", created_at: "2026-09-25T08:50:00Z" }),
      visit({ id: "wait", status: "wait", created_at: "2026-09-25T08:40:00Z" }),
      visit({ id: "in", status: "invited" }),
      visit({ id: "gone", closed_at: "2026-09-25T08:59:00Z" }),
    ]);
    expect(list.map((v) => v.id)).toEqual(["early", "late", "wait"]);
  });

  it("сообщение секретаря — не посетитель", () => {
    expect(awaitingDirector([visit({ id: "m", kind: "message" })])).toEqual([]);
  });
});

describe("unreadMessages", () => {
  it("непрочитанные сообщения по порядку; прочитанные, убранные и посетители — нет", () => {
    const list = unreadMessages([
      visit({ id: "late", kind: "message", note: "Б", created_at: "2026-09-25T08:58:00Z" }),
      visit({ id: "early", kind: "message", note: "А", created_at: "2026-09-25T08:50:00Z" }),
      visit({ id: "read", kind: "message", note: "В", status: "read" }),
      visit({ id: "gone", kind: "message", note: "Г", closed_at: "2026-09-25T08:59:00Z" }),
      visit({ id: "visitor" }),
    ]);
    expect(list.map((v) => v.id)).toEqual(["early", "late"]);
  });
});

describe("reception", () => {
  it("всё неубранное, свежие сверху", () => {
    const list = reception([
      visit({ id: "a", created_at: "2026-09-25T08:10:00Z", status: "expired" }),
      visit({ id: "b", created_at: "2026-09-25T08:20:00Z", status: "invited" }),
      visit({ id: "c", closed_at: "2026-09-25T08:30:00Z" }),
    ]);
    expect(list.map((v) => v.id)).toEqual(["b", "a"]);
  });
});

describe("тексты карточки", () => {
  it("статус, квитанция стены и кнопка", () => {
    expect(statusLine(visit({ id: "1" }))).toBe("Ждём ответа директора");
    expect(statusLine(visit({ id: "1", status: "wait" }))).toBe("Директор просит подождать");
    expect(statusLine(visit({ id: "1", status: "invited" }))).toBe("Директор: пусть заходит");
    expect(wallLine(visit({ id: "1" }))).toBe("Отправлено, экран ещё не показал");
    expect(wallLine(visit({ id: "1", shown_at: "2026-09-25T08:55:05Z" }))).toBe("На экране у директора");
    expect(wallLine(visit({ id: "1", status: "invited" }))).toBeNull();
    expect(closeLabel(visit({ id: "1" }))).toBe("Отменить");
    expect(closeLabel(visit({ id: "1", status: "invited" }))).toBe("Готово");
    expect(closeLabel(visit({ id: "1", status: "expired" }))).toBe("Понятно");
  });

  it("сообщение: ждём прочтения, прочитал, не прочитал", () => {
    const message = (patch: Partial<VisitLike> = {}) => visit({ id: "m", kind: "message", note: "Звонил Ахметов", ...patch });
    expect(statusLine(message())).toBe("Ждём, пока директор прочитает");
    expect(statusLine(message({ status: "read" }))).toBe("Директор прочитал");
    expect(statusLine(message({ status: "expired" }))).toBe("Директор не прочитал");
    expect(statusTone(message({ status: "read" }))).toBe("ok");
    expect(wallLine(message({ shown_at: "2026-09-25T08:55:05Z" }))).toBe("На экране у директора");
    expect(wallLine(message({ status: "read" }))).toBeNull();
    expect(closeLabel(message())).toBe("Отменить");
    expect(closeLabel(message({ status: "read" }))).toBe("Понятно");
  });
});

describe("recentNotes", () => {
  it("свежие слова без повторов, пустые пропускает", () => {
    const notes = recentNotes([
      visit({ id: "1", note: "Иванов, поставки", created_at: "2026-09-25T08:00:00Z" }),
      visit({ id: "2", note: "иванов, поставки", created_at: "2026-09-24T08:00:00Z" }),
      visit({ id: "3", note: null }),
      visit({ id: "4", note: "Курьер", created_at: "2026-09-25T08:30:00Z" }),
    ]);
    expect(notes).toEqual(["Курьер", "Иванов, поставки"]);
  });

  it("посетители и сообщения — разными списками", () => {
    const list = [
      visit({ id: "1", note: "Курьер", created_at: "2026-09-25T08:00:00Z" }),
      visit({ id: "2", kind: "message", note: "Звонил Ахметов", created_at: "2026-09-25T08:30:00Z" }),
    ];
    expect(recentNotes(list)).toEqual(["Курьер"]);
    expect(recentNotes(list, "message")).toEqual(["Звонил Ахметов"]);
  });
});

describe("waitedSince", () => {
  it("минуты и часы", () => {
    expect(waitedSince("2026-09-25T09:00:00Z", NOW)).toBe("только что");
    expect(waitedSince("2026-09-25T08:53:00Z", NOW)).toBe("7 мин");
    expect(waitedSince("2026-09-25T07:55:00Z", NOW)).toBe("1 ч 5 мин");
  });
});
