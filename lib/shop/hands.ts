/**
 * Whose the points on hands are (D-194): the team's — the people the rating and the balances
 * table count (`isTeamMember`, lib/people/team.ts) — and the rest, said apart: points of people who
 * left stay theirs in the ledger (principle 4), but they are not «у команды». A head that summed
 * everybody showed a figure no row under it adds up to. Pure — the phone's shop and the desk's
 * «Очки и магазин» read the same split.
 */
import { isGoneMember, isTeamMember, type TeamPerson } from "@/lib/people/team";

export type Hands = {
  /** Held by the team now — equals the sum of the balances table's rows. */
  team: number;
  /** Held by people who left the team (their history stays). */
  gone: number;
  /** Anybody else: the director, the wall, a profile the reader cannot see. */
  other: number;
};

export function splitHands(
  balances: readonly { userId: string; points: number }[],
  people: readonly (TeamPerson & { id: string })[],
): Hands {
  const byId = new Map(people.map((person) => [person.id, person]));
  const hands: Hands = { team: 0, gone: 0, other: 0 };
  for (const { userId, points } of balances) {
    const person = byId.get(userId);
    if (person && isTeamMember(person)) hands.team += points;
    else if (person && isGoneMember(person)) hands.gone += points;
    else hands.other += points;
  }
  return hands;
}
