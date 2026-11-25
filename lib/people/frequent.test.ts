import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabase: () => ({}) }));

import type { RosterEntry } from "@/lib/people/roster";

import { pinOf, rankFrequent } from "./frequent";

const person = (id: string, full_name: string, role: RosterEntry["role"] = "employee", aliases: string[] = []): RosterEntry => ({
  id,
  full_name,
  position: null,
  avatar_url: null,
  role,
  aliases,
});

const ROSTER = [
  person("me", "Тимур Директоров", "director"),
  person("d2", "Второй Директор", "director"),
  person("tv", "Стена", "tv"),
  person("a", "Айгуль Сапарова"),
  person("e", "Ерлан Бекетов"),
  person("m", "Марат Оспанов", "secretary"),
  person("z", "Жандос Нуров"),
];

describe("rankFrequent (D-192)", () => {
  it("orders by how often the director gave work, most first", () => {
    const ids = ["e", "a", "e", "m", "e", "a"];
    expect(rankFrequent(ids, ROSTER, "me").map((p) => p.id)).toEqual(["e", "a", "m"]);
  });

  it("never offers the director himself, another director or the wall", () => {
    expect(rankFrequent(["me", "d2", "tv", "a"], ROSTER, "me").map((p) => p.id)).toEqual(["a"]);
  });

  it("drops people who left the roster and orders without an assignee", () => {
    expect(rankFrequent(["gone", null, "z"], ROSTER, "me").map((p) => p.id)).toEqual(["z"]);
  });

  it("breaks a tie by name and keeps to the limit", () => {
    expect(rankFrequent(["z", "a", "e", "m"], ROSTER, "me", 2).map((p) => p.id)).toEqual(["a", "e"]);
  });

  it("offers nobody before the first order", () => {
    expect(rankFrequent([], ROSTER, "me")).toEqual([]);
  });
});

describe("pinOf", () => {
  it("addresses a person by the first name, never by a learned form", () => {
    expect(pinOf(person("a", "Айгуль Сапарова")).address).toBe("Айгуль, ");
    expect(pinOf(person("z", "Жандос Нуров", "employee", ["Жандас"])).address).toBe("Жандос, ");
    expect(pinOf(person("a", "Айгуль Сапарова")).id).toBe("a");
  });
});
