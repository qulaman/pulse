import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HISTORY_SOURCES, SERVICE_SOURCES, deleteRefusal, historyLines, historyWords, sourceKey } from "./history";

const director = { id: "d1", role: "director" as const };
const director2 = { id: "d2", role: "director" as const };
const secretary = { id: "s1", role: "secretary" as const };
const secretary2 = { id: "s2", role: "secretary" as const };
const marat = { id: "e1", role: "employee" as const };
const kiosk = { id: "tv", role: "tv" as const };

/** Every column with a foreign key to profiles, read from the migrations: `table.column`, how it deletes. */
function foreignKeysToProfiles(): Map<string, string> {
  const dir = join(process.cwd(), "supabase", "migrations");
  const keys = new Map<string, string>();
  for (const file of readdirSync(dir).sort()) {
    let table: string | null = null;
    for (const line of readFileSync(join(dir, file), "utf8").split(/\r?\n/)) {
      const code = line.replace(/--.*$/, "");
      const opened = /create table (?:if not exists )?(?:public\.)?(\w+)/i.exec(code) ?? /alter table (?:if exists )?(?:only )?(?:public\.)?(\w+)/i.exec(code);
      if (opened) table = opened[1];
      if (!/references\s+(?:public\.)?profiles\b/i.test(code)) continue;
      const added = /add column (?:if not exists )?"?(\w+)"?/i.exec(code);
      const column = added ? added[1] : /^\s*"?(\w+)"?\s/.exec(code)?.[1];
      keys.set(`${table}.${column}`, /on delete (cascade|set null)/i.exec(code)?.[1]?.toLowerCase() ?? "no action");
    }
  }
  return keys;
}

describe("the list of what stands behind a card", () => {
  const keys = foreignKeysToProfiles();
  const history = new Set(HISTORY_SOURCES.map(sourceKey));
  const service = new Set(SERVICE_SOURCES.map(sourceKey));

  it("sees the migrations at all", () => {
    expect(keys.size).toBeGreaterThanOrEqual(40);
    expect(keys.get("tasks.assignee_id")).toBe("no action");
    expect(keys.get("event_participants.user_id")).toBe("cascade");
  });

  it("knows every foreign key to profiles — a new one is decided here, not cascaded away", () => {
    const unknown = [...keys.keys()].filter((key) => !history.has(key) && !service.has(key));
    expect(unknown).toEqual([]);
  });

  it("names no column that is not a foreign key any more", () => {
    const stale = [...history, ...service].filter((key) => !keys.has(key));
    expect(stale).toEqual([]);
  });

  it("never files a column twice", () => {
    expect([...history].filter((key) => service.has(key))).toEqual([]);
    expect(history.size).toBe(HISTORY_SOURCES.length);
    expect(service.size).toBe(SERVICE_SOURCES.length);
  });

  it("lets only cascades and set null count as housekeeping: a no-action key would stop the delete anyway", () => {
    const stopping = [...service].filter((key) => keys.get(key) === "no action");
    expect(stopping).toEqual([]);
  });

  it("keeps meetings a person took part in, though the key cascades", () => {
    expect(history.has("event_participants.user_id")).toBe(true);
  });
});

describe("historyLines", () => {
  it("adds up the sources of one label, the fullest first, and drops zeros", () => {
    const lines = historyLines({ "tasks.assignee_id": 2, "tasks.author_id": 1, "point_transactions.user_id": 5, "orders.user_id": 0 });
    expect(lines).toEqual([
      { label: "очки", count: 5 },
      { label: "задачи", count: 3 },
    ]);
    expect(historyWords(lines)).toBe("очки — 5, задачи — 3");
  });

  it("is empty for a card nothing stands behind — housekeeping does not count", () => {
    expect(historyLines({})).toEqual([]);
    expect(historyLines({ "push_subscriptions.user_id": 3, "login_codes.user_id": 2 })).toEqual([]);
  });
});

describe("deleteRefusal", () => {
  const none: never[] = [];
  const some = [{ label: "задачи", count: 1 }];

  it("lets a duplicate go", () => {
    expect(deleteRefusal(director, marat, none)).toBeNull();
    expect(deleteRefusal(secretary, marat, none)).toBeNull();
    expect(deleteRefusal(director, secretary, none)).toBeNull();
    expect(deleteRefusal(secretary, kiosk, none)).toBeNull();
  });

  it("refuses a card with history, whoever asks, and says what stands behind it", () => {
    const refusal = deleteRefusal(director, marat, some);
    expect(refusal).toMatchObject({ status: 409, code: "has_history" });
    expect(refusal?.message).toContain("задачи — 1");
    expect(deleteRefusal(secretary, marat, some)?.status).toBe(409);
  });

  it("never deletes oneself or a director — also with an empty history", () => {
    expect(deleteRefusal(director, director, none)).toMatchObject({ status: 403, code: "self" });
    expect(deleteRefusal(secretary, secretary, none)).toMatchObject({ status: 403, code: "self" });
    expect(deleteRefusal(director, director2, none)).toMatchObject({ status: 403, code: "director" });
    expect(deleteRefusal(secretary, director, none)).toMatchObject({ status: 403, code: "director" });
  });

  it("the secretary may delete another secretary's duplicate; an employee nobody", () => {
    expect(deleteRefusal(secretary, secretary2, none)).toBeNull();
    expect(deleteRefusal(marat, kiosk, none)).toMatchObject({ status: 403, code: "forbidden" });
  });

  it("asks the rights before the count: a refusal comes without history", () => {
    expect(deleteRefusal(secretary, director, null)?.status).toBe(403);
    expect(deleteRefusal(director, marat, null)).toBeNull();
  });
});
