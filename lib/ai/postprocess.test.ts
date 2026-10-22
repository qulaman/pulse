import { describe, expect, it } from "vitest";

import { fromModelEntity, postprocess } from "./postprocess";
import type { Entity, EventEntity, PointsEntity, TaskEntity } from "./schema";
import type { RosterUser } from "../matchName";

const ROSTER: RosterUser[] = [
  { id: "u-003", full_name: "Марат Оспанов", aliases: ["Марат"], is_active: true },
  { id: "u-005", full_name: "Айгуль Сапарова", aliases: ["Айгуль"], is_active: true },
  { id: "u-009", full_name: "Тимур Салимов", aliases: ["Тимур"], is_active: false },
];

function task(overrides: Partial<TaskEntity> = {}): TaskEntity {
  return {
    kind: "task",
    assignee_queries: ["Марат"],
    assignee_id: "u-003",

    assignee_name: null,
    assignee_confidence: 0.95,
    group_id: null,
    title: "КП по Казхрому",
    body: null,
    deadline_iso: "2026-08-14T13:00:00+05:00",
    deadline_confidence: 0.7,
    deadline_source_text: "завтра до обеда",
    priority: "normal",
    scheduled_send_at: null,
    source_span: "Марат КП по Казхрому завтра до обеда",
    ...overrides,
  };
}

function points(overrides: Partial<PointsEntity> = {}): PointsEntity {
  return {
    kind: "points",
    assignee_queries: ["Марату"],
    assignee_id: "u-003",

    assignee_name: null,
    assignee_confidence: 0.95,
    amount: 10,
    reason: null,
    source_span: "Марату плюс десять",
    ...overrides,
  };
}

function event(overrides: Partial<EventEntity> = {}): EventEntity {
  return {
    kind: "event",
    title: "Планёрка",
    body: null,
    location: "в офисе",
    starts_at_iso: "2026-08-14T10:00:00+05:00",
    ends_at_iso: null,
    time_confidence: 0.95,
    time_source_text: "завтра в десять",
    participant_queries: ["Марат", "Айгуль"],
    participant_names: ["Марат Оспанов", "Айгуль Сапарова"],
    participant_ids: [],
    everyone: false,
    remind_before_min: null,
    repeat: "none",
    source_span: "завтра в десять планёрка, Марат и Айгуль",
    ...overrides,
  };
}

const run = (entities: Entity[], source: "voice" | "typed" | "shared" = "voice") =>
  postprocess(entities, ROSTER, source);

describe("postprocess", () => {
  it("drops an assignee_id that is missing from the roster or inactive", () => {
    const [invented] = run([task({ assignee_id: "u-999", assignee_name: null, assignee_queries: ["Марат"] })]);
    // the fuzzy match replaces the invented id, so the payload agrees with the chip
    expect(invented.kind === "task" && invented.assignee_id).toBe("u-003");
    expect(invented.assignee).toMatchObject({ status: "matched", user_id: "u-003" });

    const [inactive] = run([task({ assignee_id: "u-009", assignee_name: null, assignee_queries: ["Тимур"] })]);
    expect(inactive.kind === "task" && inactive.assignee_id).toBeNull();
    expect(inactive.assignee?.status).toBe("unmatched");
    expect(inactive.blocked).toBe("assignee_unmatched");
  });

  it("removes points worth zero", () => {
    expect(run([points({ amount: 0 })])).toHaveLength(0);
  });

  it("keeps a minus from voice sendable — the director said it (D-137, revises D-30)", () => {
    const [entity] = run([points({ amount: -5 })]);
    expect(entity.kind === "points" && entity.amount).toBe(-5);
    expect(entity.blocked).toBeUndefined();
  });

  it("blocks any points coming from shared text (D-36)", () => {
    const [entity] = run([points({ amount: 10 })], "shared");
    expect(entity.blocked).toBe("points_blocked");
  });

  it("nulls an unparsable ISO deadline together with its confidence", () => {
    const [entity] = run([task({ deadline_iso: "к пятнице", deadline_confidence: 0.6 })]);
    expect(entity.kind === "task" && entity.deadline_iso).toBeNull();
    expect(entity.kind === "task" && entity.deadline_confidence).toBeNull();
  });

  it("attaches an assignee match to every entity that has assignee fields", () => {
    const [entity] = run([task({ assignee_queries: ["Айгуль"], assignee_id: null })]);
    expect(entity.assignee).toMatchObject({ status: "matched", user_id: "u-005" });
    expect(entity.kind === "task" && entity.assignee_id).toBe("u-005");
    expect(entity.blocked).toBeUndefined();
  });

  it("resolves every participant of an event into an id (D-56)", () => {
    const [entity] = run([event()]);
    expect(entity.kind === "event" && entity.participant_ids).toEqual(["u-003", "u-005"]);
    expect(entity.participants).toHaveLength(2);
    expect(entity.blocked).toBeUndefined();
  });

  it("keeps an event sendable when one of the names is nobody in the roster", () => {
    const [entity] = run([
      event({
        participant_queries: ["Марат", "Сакеном"],
        participant_names: ["Марат Оспанов", "Сакен Абаев"],
      }),
    ]);
    expect(entity.kind === "event" && entity.participant_ids).toEqual(["u-003"]);
    expect(entity.participants?.[1].match.status).not.toBe("matched");
    expect(entity.blocked).toBeUndefined();
  });

  it("blocks an event that has no time at all", () => {
    const [entity] = run([event({ starts_at_iso: null, time_confidence: null })]);
    expect(entity.blocked).toBe("time_missing");
  });

  it("nulls an unparsable start together with its confidence, and blocks the card", () => {
    const [entity] = run([event({ starts_at_iso: "в пятницу", time_confidence: 0.5 })]);
    expect(entity.kind === "event" && entity.starts_at_iso).toBeNull();
    expect(entity.kind === "event" && entity.time_confidence).toBeNull();
    expect(entity.blocked).toBe("time_missing");
  });

  it("clears the model id when the bare name has namesakes (D-16, wrong assignee = never)", () => {
    const roster: RosterUser[] = [
      ...ROSTER,
      { id: "u-001", full_name: "Ерлан Байжанов", aliases: ["Ерлан"], is_active: true },
      { id: "u-002", full_name: "Ерлан Досов", aliases: ["Ерлан"], is_active: true },
    ];
    const [entity] = postprocess([task({ assignee_id: "u-001", assignee_name: null, assignee_queries: ["Ерлану"] })], roster, "voice");
    expect(entity.kind === "task" && entity.assignee_id).toBeNull();
    expect(entity.assignee?.status).toBe("ambiguous");
    expect(entity.blocked).toBe("assignee_unmatched");
  });
});

describe("fromModelEntity: the model's TimeRefs become the app's ISO fields (task 026)", () => {
  const NOW = new Date("2026-08-13T16:32:00+05:00");
  const said = { weekday: null, date: null, time: null, part: null, confidence: 0.95 } as const;

  it("a task: deadline, its confidence and words, and a delayed send", () => {
    const entity = fromModelEntity(
      {
        kind: "task",
        assignee_queries: ["Марат"],
        assignee_name: "Марат Оспанов",
        assignee_confidence: 0.98,
        group_id: null,
        title: "КП",
        body: null,
        deadline: { ...said, text: "завтра до обеда", day: "tomorrow", part: "before_lunch" },
        priority: "normal",
        scheduled_send: { ...said, text: "утром отправь", day: "tomorrow", part: "morning" },
        source_span: "Марат КП завтра до обеда, утром отправь",
      },
      NOW,
    );
    expect(entity).toMatchObject({
      assignee_id: null,
      deadline_iso: "2026-08-14T13:00:00+05:00",
      deadline_confidence: 0.7,
      deadline_source_text: "завтра до обеда",
      scheduled_send_at: "2026-08-14T09:00:00+05:00",
    });
    expect(entity).not.toHaveProperty("deadline");
  });

  it("an event: the model's \"\" become null, a day without a time is 09:00 at 0.5", () => {
    const entity = fromModelEntity(
      {
        kind: "event",
        title: "Корпоратив",
        location: "",
        starts_at: { ...said, text: "в пятницу", day: "weekday", weekday: 5 },
        participant_names: [],
        everyone: true,
        repeat: "none",
        source_span: "В пятницу корпоратив",
      },
      NOW,
    );
    expect(entity).toMatchObject({
      location: null,
      starts_at_iso: "2026-08-14T09:00:00+05:00",
      time_confidence: 0.5,
      time_source_text: "в пятницу",
      participant_ids: [],
    });
  });

  it("a reminder without a time keeps null", () => {
    expect(fromModelEntity({ kind: "reminder", text: "Позвонить в банк", remind_at: null, source_span: "напомни" }, NOW)).toEqual({
      kind: "reminder",
      text: "Позвонить в банк",
      remind_at_iso: null,
      source_span: "напомни",
    });
  });
});

describe("a repeating order (D-148): the model names the rule, code fixes the hour", () => {
  const NOW = new Date("2026-08-13T16:32:00+05:00");
  const said = {
    kind: "recurrence" as const,
    assignee_queries: ["Айгуль"],
    assignee_name: "Айгуль Сапарова",
    assignee_confidence: 0.95,
    title: "Отчёт по ПЗТМ",
    every: "week" as const,
    interval: 1,
    weekdays: [1 as const],
    month_day: 0,
    time: "",
    part: "" as const,
    source_span: "Каждый понедельник Айгуль отчёт по ПЗТМ",
  };

  it("nothing said about the hour — the end of the working day", () => {
    const entity = fromModelEntity(said, NOW);
    expect(entity).toMatchObject({ every: "week", weekdays: [1], interval: 1, month_day: 0, due_time: "18:00", assignee_id: null });
    expect(entity).not.toHaveProperty("time");
    expect(entity).not.toHaveProperty("part");
  });

  it("a named hour is a working hour, a part of the day is the company's", () => {
    expect(fromModelEntity({ ...said, time: "5:00" }, NOW)).toMatchObject({ due_time: "17:00" });
    expect(fromModelEntity({ ...said, time: "09:30", part: "morning" }, NOW)).toMatchObject({ due_time: "09:30" });
    expect(fromModelEntity({ ...said, part: "before_lunch" }, NOW)).toMatchObject({ due_time: "13:00" });
    const own = [{ key: "before_lunch" as const, phrase: "до обеда", time: "12:00", day: "same" as const, confidence: 0.7 }];
    expect(fromModelEntity({ ...said, part: "before_lunch" }, NOW, own)).toMatchObject({ due_time: "12:00" });
  });

  it("a rule the model left half-said is made whole", () => {
    expect(fromModelEntity({ ...said, weekdays: [], interval: 0 }, NOW)).toMatchObject({ weekdays: [1], interval: 1 });
    expect(fromModelEntity({ ...said, every: "month", weekdays: [3 as never], month_day: 0 }, NOW)).toMatchObject({ weekdays: [], month_day: 1 });
  });

  it("is matched like a task and blocked without a person", () => {
    const [matched] = postprocess([fromModelEntity(said, NOW)], ROSTER, "voice");
    expect(matched).toMatchObject({ assignee_id: "u-005" });
    expect(matched.blocked).toBeUndefined();
    const [nobody] = postprocess([fromModelEntity({ ...said, assignee_queries: [], assignee_name: null, assignee_confidence: 0 }, NOW)], ROSTER, "voice");
    expect(nobody.blocked).toBe("assignee_unmatched");
  });
});
