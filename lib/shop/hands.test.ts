import { describe, expect, it } from "vitest";

import { splitHands } from "./hands";

const person = (id: string, role: string, is_active = true) => ({ id, role, is_active }) as { id: string; role: "employee"; is_active: boolean };

describe("splitHands", () => {
  // the stand of 2026-11-24: three at work, six who left — the head said 3 417, the rows 1 835
  const people = [
    person("a", "employee"),
    person("y", "secretary"),
    person("e", "employee"),
    person("s", "employee", false),
    person("d", "manager", false),
    person("t", "shopkeeper", false),
    person("boss", "director"),
    person("wall", "tv"),
  ];
  const balances = [
    { userId: "a", points: 924 },
    { userId: "y", points: 910 },
    { userId: "e", points: 1 },
    { userId: "s", points: 1000 },
    { userId: "d", points: 400 },
    { userId: "t", points: 0 },
  ];

  it("counts the team apart from who left", () => {
    expect(splitHands(balances, people)).toEqual({ team: 1835, gone: 1400, other: 0 });
  });

  it("the team's part is the sum of the rows the rating shows", () => {
    const rows = people.filter((p) => p.is_active && ["employee", "manager", "shopkeeper", "secretary"].includes(p.role));
    const sum = rows.reduce((total, p) => total + (balances.find((b) => b.userId === p.id)?.points ?? 0), 0);
    expect(splitHands(balances, people).team).toBe(sum);
  });

  it("the director, the wall and an unknown profile are neither", () => {
    const hands = splitHands(
      [
        { userId: "boss", points: 5 },
        { userId: "wall", points: 2 },
        { userId: "ghost", points: 3 },
      ],
      people,
    );
    expect(hands).toEqual({ team: 0, gone: 0, other: 10 });
  });

  it("keeps a minus where it is", () => {
    expect(splitHands([{ userId: "y", points: -999_985 }, { userId: "s", points: -10 }], people)).toEqual({ team: -999_985, gone: -10, other: 0 });
  });

  it("nothing yet", () => {
    expect(splitHands([], people)).toEqual({ team: 0, gone: 0, other: 0 });
  });
});
