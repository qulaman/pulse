import { describe, expect, it } from "vitest";

import { TEAM_ROLES } from "@/lib/routes";

import { isTeamMember as isTeamMemberOfQueries } from "./queries";
import { absenceOf, countTeam, isGoneMember, isHere, isTeamMember, teamOf, type PresencePerson } from "./team";

const NOW = Date.parse("2026-11-24T05:00:00Z");
const person = (patch: Partial<PresencePerson> = {}): PresencePerson => ({ is_active: true, role: "employee", availability: "active", away_until: null, ...patch });

// the dev company on 2026-11-24, the one the review counted 3, 5, 6, 7 and 9 on
const COMPANY: PresencePerson[] = [
  person({ role: "director" }),
  person({ role: "director" }),
  person(),
  person(),
  person({ role: "tv" }),
  person({ role: "secretary" }),
  person({ role: "director", is_active: false }),
  person({ role: "director", is_active: false }),
  person({ role: "manager", is_active: false }),
  person({ is_active: false }),
  person({ is_active: false }),
  person({ is_active: false }),
  person({ is_active: false }),
  person({ role: "shopkeeper", is_active: false }),
];

describe("isTeamMember", () => {
  it("every role that is given work, alive", () => {
    for (const role of TEAM_ROLES) expect(isTeamMember(person({ role }))).toBe(true);
  });

  it("not the director, not the kiosk, not the ones who left", () => {
    expect(isTeamMember(person({ role: "director" }))).toBe(false);
    expect(isTeamMember(person({ role: "tv" }))).toBe(false);
    expect(isTeamMember(person({ is_active: false }))).toBe(false);
  });

  it("lib/people/queries.ts gives the same function — one rule for every screen", () => {
    expect(isTeamMemberOfQueries).toBe(isTeamMember);
  });
});

describe("isGoneMember", () => {
  it("left the team; a director or a kiosk switched off is not «ушедший из команды»", () => {
    expect(isGoneMember(person({ is_active: false }))).toBe(true);
    expect(isGoneMember(person({ role: "secretary", is_active: false }))).toBe(true);
    expect(isGoneMember(person({ role: "director", is_active: false }))).toBe(false);
    expect(isGoneMember(person({ role: "tv", is_active: false }))).toBe(false);
    expect(isGoneMember(person())).toBe(false);
  });
});

describe("absenceOf and isHere", () => {
  it("vacation, sick leave, «не на месте до …» in the future", () => {
    expect(absenceOf(person({ availability: "vacation" }), NOW)).toBe("vacation");
    expect(absenceOf(person({ availability: "sick" }), NOW)).toBe("sick");
    expect(absenceOf(person({ away_until: "2026-11-24T06:00:00Z" }), NOW)).toBe("out");
    expect(absenceOf(person({ away_until: "2026-11-24T04:59:00Z" }), NOW)).toBeNull();
    expect(absenceOf(person(), NOW)).toBeNull();
  });

  it("here — in the team and present; the director at his desk is not counted «на месте»", () => {
    expect(isHere(person(), NOW)).toBe(true);
    expect(isHere(person({ availability: "sick" }), NOW)).toBe(false);
    expect(isHere(person({ role: "director" }), NOW)).toBe(false);
    expect(isHere(person({ role: "tv" }), NOW)).toBe(false);
    expect(isHere(person({ is_active: false }), NOW)).toBe(false);
  });
});

describe("countTeam", () => {
  it("the dev company: 3 in the team, 3 here, 6 who left — whatever list it is given", () => {
    expect(countTeam(COMPANY, NOW)).toEqual({ team: 3, here: 3, away: 0, vacation: 0, sick: 0, out: 0, gone: 6 });
  });

  it("away by reason, and away = vacation + sick + out", () => {
    const count = countTeam(
      [person({ availability: "vacation" }), person({ availability: "sick" }), person({ away_until: "2026-11-24T07:00:00Z" }), person(), person({ role: "director", availability: "vacation" })],
      NOW,
    );
    expect(count).toEqual({ team: 4, here: 1, away: 3, vacation: 1, sick: 1, out: 1, gone: 0 });
    expect(count.here + count.away).toBe(count.team);
  });

  it("empty and one", () => {
    expect(countTeam([], NOW)).toEqual({ team: 0, here: 0, away: 0, vacation: 0, sick: 0, out: 0, gone: 0 });
    expect(countTeam([person()], NOW).team).toBe(1);
  });

  it("teamOf keeps the list's order and only the team", () => {
    const list = [person({ role: "manager" }), person({ role: "tv" }), person({ role: "secretary" })];
    expect(teamOf(list)).toEqual([list[0], list[2]]);
    expect(teamOf(COMPANY)).toHaveLength(countTeam(COMPANY, NOW).team);
  });
});
