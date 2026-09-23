import { describe, expect, it } from "vitest";

import { loadsOf, peopleField, stageOf, toneOf, type Load } from "./people";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const AREA = { hx: 150, hy: 300, seed: 7, now: NOW };

function person(id: string, fullName: string, extra: Partial<{ alias: string | null; available: boolean }> = {}) {
  return { id, fullName, alias: null, available: true, ...extra };
}
function load(extra: Partial<Load> = {}): Load {
  return { active: 0, overdue: 0, nearest: null, review: 0, stage: "work", tasks: [], ...extra };
}

describe("loadsOf", () => {
  it("counts what is on a person right now, and what he has handed in", () => {
    const loads = loadsOf(
      [
        { id: "1", assignee_id: "a", status: "sent", deadline: null, title: "раз" },
        { id: "2", assignee_id: "a", status: "accepted", deadline: "2026-09-17T09:00:00Z", title: "два" },
        { id: "3", assignee_id: "a", status: "pending_review", deadline: "2026-09-16T09:00:00Z", title: "три" },
        { id: "4", assignee_id: "b", status: "done", deadline: null, title: "четыре" },
        { id: "5", assignee_id: null, status: "sent", deadline: null, title: "пять" },
      ],
      NOW,
    );
    // handed in still counts as in the air — only its deadline stops being his problem
    expect(loads.a).toMatchObject({ active: 3, overdue: 1, nearest: "2026-09-17T09:00:00Z", review: 1 });
    expect(loads.b).toMatchObject({ active: 0, overdue: 0, nearest: null, review: 0 });
  });
});

describe("stageOf", () => {
  const row = (extra: Partial<Parameters<typeof stageOf>[0]>) => stageOf({ id: "1", assignee_id: "a", status: "accepted", deadline: null, title: "t", ...extra }, NOW);

  it("reads the stage of the director's own task, loudest first", () => {
    expect(row({ status: "sent" })).toBe("nova"); // выдана, ещё не принял
    expect(row({ status: "accepted" })).toBe("work");
    expect(row({ status: "rework" })).toBe("work");
    expect(row({ status: "pending_review" })).toBe("review");
    expect(row({ status: "declined" })).toBe("alarm"); // «не могу»
    expect(row({ status: "accepted", question: "а когда?" })).toBe("alarm");
    expect(row({ status: "accepted", deadline: "2026-09-17T09:00:00Z" })).toBe("alarm"); // просрочка
    // handed in late is the director's problem, not his: it stays green
    expect(row({ status: "pending_review", deadline: "2026-09-16T09:00:00Z" })).toBe("review");
  });

  it("a person wears the loudest stage he carries, and his tasks come loudest first", () => {
    const loads = loadsOf(
      [
        { id: "1", assignee_id: "a", status: "accepted", deadline: null, title: "спокойная" },
        { id: "2", assignee_id: "a", status: "sent", deadline: null, title: "свежая" },
        { id: "3", assignee_id: "a", status: "declined", deadline: null, title: "отказ" },
      ],
      NOW,
    );
    expect(loads.a!.stage).toBe("alarm");
    expect(loads.a!.tasks.map((t) => t.title)).toEqual(["отказ", "свежая", "спокойная"]);
    // «не могу» is not work on him any more, but it keeps him in the sky
    expect(loads.a!.active).toBe(2);
  });
});

describe("toneOf", () => {
  it("is the same rule the team screen uses", () => {
    expect(toneOf(load(), true, NOW)).toBe("idle");
    expect(toneOf(load({ active: 1 }), false, NOW)).toBe("idle"); // on holiday: not an idler to catch
    expect(toneOf(load({ active: 1, overdue: 1 }), true, NOW)).toBe("red");
    expect(toneOf(load({ active: 1, nearest: "2026-09-17T20:00:00Z" }), true, NOW)).toBe("yellow");
    expect(toneOf(load({ active: 1, nearest: "2026-09-30T20:00:00Z" }), true, NOW)).toBe("green");
  });
});

describe("peopleField", () => {
  const team = ["Марат Ким", "Динара Асанова", "Ерлан Бек", "Тимур Сон", "Айгуль Ким"].map((n, i) => person(`p${i}`, n));
  const busy = { p0: load({ active: 3 }), p2: load({ active: 1, overdue: 1 }) };

  it("puts everyone in the same place for the same seed, wherever he stands in the list", () => {
    const straight = peopleField({ people: team, loads: busy, ...AREA });
    const shuffled = peopleField({ people: [...team].reverse(), loads: busy, ...AREA });
    for (const orb of straight) expect(shuffled.find((o) => o.id === orb.id)).toEqual(orb);
    expect(peopleField({ people: team, loads: busy, ...AREA, seed: 8 })).not.toEqual(straight);
  });

  it("работают — над лицом, бездельники — под ним, и никто не на лице", () => {
    const orbs = peopleField({ people: team, loads: busy, ...AREA, hole: 104 });
    expect(orbs.length).toBe(team.length);
    for (const orb of orbs) {
      expect(Math.hypot(orb.x, orb.y)).toBeGreaterThanOrEqual(104);
      expect(Math.abs(orb.x)).toBeLessThanOrEqual(AREA.hx);
      expect(Math.abs(orb.y)).toBeLessThanOrEqual(AREA.hy);
      expect(orb.working ? orb.y : -orb.y).toBeLessThan(0);
      // both ends of the flight are known for everyone, so a trip has somewhere to land
      expect(orb.starY).toBeLessThan(0);
      expect(orb.idleY).toBeGreaterThan(0);
    }
  });

  it("a loaded person is a bigger star, and two tasks make it a sparkle", () => {
    const orbs = peopleField({ people: team, loads: { p0: load({ active: 5 }), p1: load({ active: 1 }) }, ...AREA });
    const loaded = orbs.find((o) => o.id === "p0")!;
    const light = orbs.find((o) => o.id === "p1")!;
    expect(loaded.starSize).toBeGreaterThan(light.starSize);
    expect(loaded.points).toBe(4);
    expect(light.points).toBe(0);
  });

  it("an idler drifts and hands his name to the typed input when he is caught", () => {
    const orbs = peopleField({ people: team, loads: busy, ...AREA });
    const idler = orbs.find((o) => !o.working)!;
    expect(Math.hypot(idler.dx, idler.dy)).toBeGreaterThan(0);
    expect(idler.address.endsWith(", ")).toBe(true);
    expect(peopleField({ people: [person("x", "Ерлан Бек", { alias: "Ерлану" })], loads: {}, ...AREA })[0]!.address).toBe("Ерлану, ");
  });

  it("the floor starts below the words under the face, and may use the room the flight cannot", () => {
    const many = Array.from({ length: 30 }, (_, i) => person(`p${i}`, `Имя${i} Фамилия${i}`));
    const idlers = peopleField({ people: many, loads: {}, ...AREA, maxIdlers: 12 }).filter((o) => !o.working);
    // while the microphone is open the stage and the timer hang right under the head: the
    // first row stood on those words, and that is what the owner saw (2026-09-18)
    const highest = Math.min(...idlers.map((o) => o.y - o.size / 2));
    expect(highest).toBeGreaterThanOrEqual(126);
    // a short screen would lose a whole row to that: the rows stand still, so they are allowed
    // past the edge the dream has to keep clear of
    const short = { ...AREA, hy: 190 };
    const tight = peopleField({ people: many, loads: {}, ...short, maxIdlers: 12 }).filter((o) => !o.working);
    const roomy = peopleField({ people: many, loads: {}, ...short, reach: 240, maxIdlers: 12 }).filter((o) => !o.working);
    expect(roomy.length).toBeGreaterThan(tight.length);
    expect(Math.max(...roomy.map((o) => o.y))).toBeLessThanOrEqual(240);
  });

  it("the floor stands in rows, and shows only as many as the rows have room for", () => {
    const many = Array.from({ length: 30 }, (_, i) => person(`p${i}`, `Имя${i} Фамилия${i}`));
    const tall = peopleField({ people: many, loads: {}, ...AREA, maxIdlers: 12 });
    const rows = [...new Set(tall.map((o) => Math.round(o.y / 10)))];
    expect(tall.length).toBe(12);
    // a dozen people on a phone: two or three rows, not one heap and not twelve lines
    expect(rows.length).toBeGreaterThan(1);
    expect(rows.length).toBeLessThan(5);
    // side by side in a row, not on top of each other
    for (const a of tall) {
      for (const b of tall) {
        if (a === b) continue;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.size * 0.9);
      }
    }
    // a short screen shows fewer of them instead of stacking them in one place
    // 150 px of floor under the face is one row and no more
    const short = peopleField({ people: many, loads: {}, ...AREA, hy: 150, maxIdlers: 12 });
    expect(short.length).toBeLessThan(12);
    for (const a of short) for (const b of short) if (a !== b) expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.size * 0.9);
  });

  it("a company of fifty: the sky takes the loudest, the floor keeps its own quota", () => {
    const many = Array.from({ length: 52 }, (_, i) => person(`p${i}`, `Имя${i} Фамилия${i}`));
    const loads: Record<string, Load> = {};
    for (let i = 0; i < 40; i += 1) loads[`p${i}`] = load({ active: 1 + (i % 4), overdue: i < 5 ? 1 : 0 });
    const orbs = peopleField({ people: many, loads, ...AREA, maxStars: 30, maxIdlers: 12 });
    const stars = orbs.filter((o) => o.working);
    const floor = orbs.filter((o) => !o.working);
    expect(stars.length).toBe(30);
    expect(floor.length).toBe(12);
    // whoever is overdue is never the one left out of the sky
    expect(stars.filter((o) => o.tone === "red").length).toBe(5);
  });
});
