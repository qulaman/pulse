import { describe, expect, it } from "vitest";

import { channelHealth, testVerdict, type HealthRow } from "./health";

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
});
