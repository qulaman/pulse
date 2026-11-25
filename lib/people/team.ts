/**
 * Who is the team and who is here — one definition for every count of people in the product
 * (phone, desk, wall, Pulse). Pure: no React, no Supabase, safe on the server and in tests.
 *
 * The team: living people who are given work — roles `TEAM_ROLES` (the SQL twin is `team_role()`,
 * D-79) and `is_active`. Not the director (he gives the work), not the wall's kiosk (`tv` — a login,
 * not a person), not the people who left (`is_active = false`, D-160: their history stays, shown as
 * «ушли» only where history is shown).
 * Here: a team member who is not on vacation, not on sick leave and not «не на месте до …»
 * (`away_until` in the future, D-99).
 *
 * SQL twin of the same rule, for functions that count people:
 *   team:  p.is_active and team_role(p.role)
 *   here:  … and p.availability = 'active' and (p.away_until is null or p.away_until <= now())
 */
import { isTeamRole } from "@/lib/routes";
import type { Database } from "@/lib/supabase/types";

type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type TeamPerson = Pick<Profile, "is_active" | "role">;
export type PresencePerson = TeamPerson & Pick<Profile, "availability"> & Partial<Pick<Profile, "away_until">>;

/** Why a team member is not here right now. */
export type Absence = "vacation" | "sick" | "out";

/** In the team now: alive and given work. */
export function isTeamMember(person: TeamPerson): boolean {
  return person.is_active && isTeamRole(person.role);
}

/** Left the team (D-160) but was one of it: history keeps them, today's numbers do not. */
export function isGoneMember(person: TeamPerson): boolean {
  return !person.is_active && isTeamRole(person.role);
}

/** Why the person is not here now, or null — vacation and sick leave first, then «не на месте до …». */
export function absenceOf(person: PresencePerson, now: number = Date.now()): Absence | null {
  if (person.availability === "vacation") return "vacation";
  if (person.availability === "sick") return "sick";
  if (person.away_until && Date.parse(person.away_until) > now) return "out";
  return null;
}

/** A team member who is here right now. */
export function isHere(person: PresencePerson, now: number = Date.now()): boolean {
  return isTeamMember(person) && absenceOf(person, now) === null;
}

export type TeamCount = {
  /** In the team now. */
  team: number;
  /** Of them, here now. */
  here: number;
  /** Of the team, away now — by reason. `away = vacation + sick + out`. */
  away: number;
  vacation: number;
  sick: number;
  out: number;
  /** Left the team, history kept — never part of `team`. */
  gone: number;
};

/** Every count of people from one list: «N в команде», «N на месте», «M отсутствуют», «ушедшие · K». */
export function countTeam(people: readonly PresencePerson[], now: number = Date.now()): TeamCount {
  const count: TeamCount = { team: 0, here: 0, away: 0, vacation: 0, sick: 0, out: 0, gone: 0 };
  for (const person of people) {
    if (isGoneMember(person)) count.gone += 1;
    if (!isTeamMember(person)) continue;
    count.team += 1;
    const absence = absenceOf(person, now);
    if (absence === null) count.here += 1;
    else {
      count.away += 1;
      count[absence] += 1;
    }
  }
  return count;
}

/** The team out of any list of profiles, in the list's order. */
export function teamOf<P extends TeamPerson>(people: readonly P[]): P[] {
  return people.filter(isTeamMember);
}
