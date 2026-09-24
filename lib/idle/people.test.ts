import { describe, expect, it } from "vitest";

import { lookOf } from "./look";
import { addressOf, initialsOf, SKIRT, sizeFor, tasksOf, teamField } from "./people";

const NOW = new Date("2026-09-17T12:00:00Z").getTime();
const AREA = { hx: 160, hy: 320 };

describe("tasksOf", () => {
  const rows = [
    { id: "1", assignee_id: "a", status: "sent" as const, deadline: null, title: "раз" },
    { id: "2", assignee_id: "a", status: "accepted" as const, deadline: "2026-09-17T09:00:00Z", title: "два", unread: true },
    { id: "3", assignee_id: "a", status: "pending_review" as const, deadline: "2026-09-16T09:00:00Z", title: "три" },
    { id: "4", assignee_id: "b", status: "declined" as const, deadline: null, title: "четыре", decline_reason: "занят" },
    { id: "5", assignee_id: "b", status: "done" as const, deadline: null, title: "пять" },
    { id: "6", assignee_id: "c", status: "revoked" as const, deadline: null, title: "шесть" },
    { id: "7", assignee_id: null, status: "sent" as const, deadline: null, title: "семь" },
    { id: "8", assignee_id: "c", status: "accepted" as const, deadline: null, title: "восемь", question: "А когда?" },
  ];

  it("hands everybody his own tasks, loudest first, each a tap away from its screen", () => {
    const byPerson = tasksOf(rows, NOW);
    expect(byPerson.a!.map((t) => t.id)).toEqual(["2", "3", "1"]);
    expect(byPerson.a![0]).toMatchObject({ overdue: true, unread: true, href: "/tasks/2" });
    // handed in late is not overdue any more: it waits for the director
    expect(byPerson.a![1]!.overdue).toBe(false);
    expect(byPerson.b!.find((t) => t.id === "4")).toMatchObject({ status: "declined", reason: "занят" });
    expect(byPerson.c!.map((t) => t.id)).toEqual(["8"]);
    expect(byPerson.c![0]!.question).toBe("А когда?");
  });

  it("keeps a task just accepted for the moment of gold, and drops recalled and unassigned ones", () => {
    const byPerson = tasksOf(rows, NOW);
    expect(byPerson.b!.map((t) => t.status)).toEqual(["declined", "done"]);
    expect(Object.values(byPerson).flat().some((t) => t.id === "6" || t.id === "7")).toBe(false);
    // the done one alone would still read as work: the screen keeps it only for that moment
    expect(lookOf(byPerson.b!.filter((t) => t.status === "done")).ring).toBe("done");
  });
});

describe("names", () => {
  it("reads initials and the name the director calls him by", () => {
    expect(initialsOf("Марат Оспанов")).toBe("МО");
    expect(initialsOf("  ")).toBe("•");
    expect(addressOf({ id: "x", fullName: "Ерлан Бек", alias: null })).toBe("Ерлан, ");
    expect(addressOf({ id: "x", fullName: "Ерлан Бек", alias: "Ерлану" })).toBe("Ерлану, ");
  });
});

describe("teamField", () => {
  const team = (count: number, busyEvery = 2) =>
    Array.from({ length: count }, (_, i) => ({ id: `p${String(i).padStart(2, "0")}`, fullName: `Имя${String(i).padStart(2, "0")} Фамилия`, busy: i % busyEvery === 0 }));

  it("people with work stand above the face, the rest below it, clear of the words under the head", () => {
    const layout = teamField({ people: team(20), ...AREA });
    for (const person of team(20)) {
      const seat = layout.seats.get(person.id)!;
      if (person.busy) expect(seat.y + layout.size / 2).toBeLessThan(-100);
      // while the microphone is open the stage and the timer hang right under the head (2026-09-18)
      else expect(seat.y - layout.size / 2).toBeGreaterThanOrEqual(SKIRT);
    }
  });

  it("puts everyone in the same place, wherever he stands in the roster", () => {
    const straight = teamField({ people: team(20), ...AREA });
    const shuffled = teamField({ people: [...team(20)].reverse(), ...AREA });
    expect([...shuffled.seats.entries()].sort()).toEqual([...straight.seats.entries()].sort());
  });

  it("gives everybody one size, smaller for a bigger team", () => {
    expect(teamField({ people: team(8), ...AREA }).size).toBe(44);
    expect(sizeFor(20)).toBe(40);
    expect(teamField({ people: team(52), ...AREA }).size).toBe(32);
  });

  it("never puts two rings on top of each other, and stands in rows", () => {
    const layout = teamField({ people: team(40), hx: 183, hy: 350 });
    const seats = [...layout.seats.values()];
    for (let i = 0; i < seats.length; i += 1) {
      for (let j = i + 1; j < seats.length; j += 1) {
        expect(Math.hypot(seats[i]!.x - seats[j]!.x, seats[i]!.y - seats[j]!.y)).toBeGreaterThan(layout.size + 8);
      }
    }
    const rows = new Set(seats.map((s) => Math.round(s.y / 10)));
    expect(rows.size).toBeLessThan(seats.length / 3);
  });

  it("fits a company of fifty on a phone, and on a short screen counts whoever does not fit", () => {
    const phone = teamField({ people: team(52), hx: 183, hy: 360 });
    expect(phone.overflow).toEqual({ top: 0, bottom: 0 });
    const short = teamField({ people: team(52), hx: 150, hy: 250 });
    expect(short.seats.size + short.overflow.top + short.overflow.bottom).toBe(52);
    expect(short.overflow.top + short.overflow.bottom).toBeGreaterThan(0);
  });

  it("may stand further out than the dream may fly: the rows stand still", () => {
    const tight = teamField({ people: team(40), hx: 150, hy: 250 });
    const roomy = teamField({ people: team(40), hx: 150, hy: 250, wide: 180, reach: 290 });
    expect(roomy.seats.size).toBeGreaterThan(tight.seats.size);
    for (const seat of roomy.seats.values()) expect(Math.abs(seat.y) + roomy.size / 2).toBeLessThanOrEqual(290);
  });
});
