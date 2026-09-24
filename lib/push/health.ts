/**
 * Channel health in words (D-114): what the director and the secretary read next to a person
 * in «Сотрудники» and on the person's card. Pure — the clock comes in, vitest pins the words.
 * Web Push confirms nothing (D-32): «работают» means the push service took the last one and
 * the phone showed something recently, never «получил».
 */

export type HealthRow = {
  user_id: string;
  devices: number;
  enabled_devices: number;
  last_ok_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
  last_seen_at: string | null;
  no_device_at: string | null;
};

export type HealthState = "ok" | "idle" | "off" | "broken";
export type Health = { state: HealthState; text: string };

const DAY = 86_400_000;

function ms(iso: string | null): number {
  return iso ? new Date(iso).getTime() : 0;
}

export function channelHealth(row: HealthRow | undefined, now: Date = new Date()): Health {
  if (!row || row.devices === 0) {
    // a push found nobody lately: that is the reason work «was not seen»
    if (row?.no_device_at && now.getTime() - ms(row.no_device_at) < 14 * DAY) {
      return { state: "off", text: "уведомления не включены — пуши не доходят" };
    }
    return { state: "off", text: "уведомления не включены" };
  }
  if (row.enabled_devices === 0) return { state: "off", text: "все устройства выключены" };
  if (row.last_error_at && ms(row.last_error_at) > ms(row.last_ok_at)) {
    return { state: "broken", text: "последний пуш не прошёл" };
  }
  if (!row.last_ok_at) return { state: "idle", text: "включены, пушей ещё не было" };
  return { state: "ok", text: "работают" };
}

/** «Проверка связи»: the one test push's fate, read every couple of seconds. */
export type TestRow = { status: string; seen_at: string | null; sent_at: string | null; last_error: string | null };
export type TestVerdict = { done: boolean; tone: "ok" | "muted" | "warn"; text: string };

export function testVerdict(row: TestRow | null, at: (iso: string) => string): TestVerdict {
  if (!row) return { done: false, tone: "muted", text: "Отправляю…" };
  if (row.seen_at) return { done: true, tone: "ok", text: `Пришло на телефон · ${at(row.seen_at)}` };
  if (row.status === "failed") {
    if (row.last_error === "no_subscription") return { done: true, tone: "warn", text: "Уведомления не включены на телефоне" };
    return { done: true, tone: "warn", text: "Пуш не прошёл — включите уведомления заново" };
  }
  if (row.status === "sent") return { done: false, tone: "muted", text: "Отправлено, ждём телефон…" };
  return { done: false, tone: "muted", text: "Отправляю…" };
}
