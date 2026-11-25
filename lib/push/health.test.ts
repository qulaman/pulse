import { describe, expect, it } from "vitest";

import { channelHealth, noPushPeople, testVerdict, type Health, type HealthRow } from "./health";

const NOW = new Date("2026-09-24T10:00:00Z");
const base: HealthRow = {
  user_id: "u",
  devices: 1,
  enabled_devices: 1,
  last_ok_at: null,
  last_error: null,
  last_error_at: null,
  last_seen_at: null,
  no_device_at: null,
};

describe("channelHealth", () => {
  it("says a person without devices has no notifications", () => {
    expect(channelHealth({ ...base, devices: 0, enabled_devices: 0 }, NOW).state).toBe("off");
    expect(channelHealth(undefined, NOW).text).toBe("уведомления не включены");
  });

  it("adds that pushes were missed when a push found nobody lately", () => {
    expect(channelHealth({ ...base, devices: 0, enabled_devices: 0, no_device_at: "2026-09-23T09:00:00Z" }, NOW).text).toBe(
      "уведомления не включены — пуши не доходят",
    );
  });

  it("reads a newer error than success as broken", () => {
    expect(
      channelHealth({ ...base, last_ok_at: "2026-09-23T09:00:00Z", last_error_at: "2026-09-24T09:00:00Z", last_error: "push 500" }, NOW)
        .state,
    ).toBe("broken");
  });

  it("is ok after a successful push", () => {
    expect(channelHealth({ ...base, last_ok_at: "2026-09-24T09:00:00Z", last_error_at: "2026-09-20T09:00:00Z" }, NOW)).toEqual({
      state: "ok",
      text: "работают",
    });
  });

  it("knows a fresh subscription that has not carried anything yet", () => {
    expect(channelHealth(base, NOW).state).toBe("idle");
  });

  it("notices when every device was switched off", () => {
    expect(channelHealth({ ...base, devices: 2, enabled_devices: 0 }, NOW).text).toBe("все устройства выключены");
  });
});

describe("testVerdict", () => {
  const at = (iso: string) => iso.slice(11, 16);

  it("waits honestly until the phone shows it", () => {
    expect(testVerdict(null, at)).toMatchObject({ done: false, text: "Отправляю…" });
    expect(testVerdict({ status: "sent", seen_at: null, sent_at: "2026-09-24T09:14:00Z", last_error: null }, at)).toMatchObject({
      done: false,
      text: "Отправлено, ждём телефон…",
    });
  });

  it("says when the phone showed it", () => {
    expect(
      testVerdict({ status: "sent", seen_at: "2026-09-24T09:14:05Z", sent_at: "2026-09-24T09:14:00Z", last_error: null }, at),
    ).toEqual({ done: true, tone: "ok", text: "Пришло на телефон · 09:14" });
  });

  it("names the reason it cannot arrive", () => {
    expect(testVerdict({ status: "failed", seen_at: null, sent_at: null, last_error: "no_subscription" }, at).text).toBe(
      "Уведомления не включены на телефоне",
    );
  });

  it("a dead channel says so, for «Подключение» to offer switching it on anew (D-190)", () => {
    expect(testVerdict({ status: "failed", seen_at: null, sent_at: null, last_error: "410" }, at).cause).toBe("channel");
  });
});

describe("noPushPeople (D-190)", () => {
  const person = (id: string, full_name: string, extra: { is_active?: boolean; role?: string } = {}) => ({
    id,
    full_name,
    is_active: extra.is_active ?? true,
    role: extra.role ?? "employee",
  });
  const health = new Map<string, Health>([
    ["a", { state: "off", text: "уведомления не включены" }],
    ["b", { state: "ok", text: "работают" }],
    ["c", { state: "broken", text: "последний пуш не прошёл" }],
    ["d", { state: "off", text: "уведомления не включены" }],
    ["e", { state: "idle", text: "включены, пушей ещё не было" }],
  ]);

  it("the active people whose pushes do not reach them, by name, with the reason", () => {
    const people = [person("a", "Ерлан Бекетов"), person("b", "Марат"), person("c", "Айгуль Серикова"), person("d", "Дина", { is_active: false }), person("e", "Олжас")];
    expect(noPushPeople(people, health)).toEqual([
      { id: "c", fullName: "Айгуль Серикова", text: "последний пуш не прошёл", state: "broken" },
      { id: "a", fullName: "Ерлан Бекетов", text: "уведомления не включены", state: "off" },
    ]);
  });

  it("the wall has no phone; nothing known — nothing said", () => {
    expect(noPushPeople([person("a", "Экран", { role: "tv" })], health)).toEqual([]);
    expect(noPushPeople([person("a", "Ерлан")], undefined)).toEqual([]);
  });
});
