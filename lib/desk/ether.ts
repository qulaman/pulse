/**
 * «Объявления» on the desk: who has read what, and what still waits for the delivery window
 * (D-38, D-129). Pure: the same acks and the same outbox as the phone's Эфир, read for a table.
 */

export type Reach<P> = { seen: number; of: number; missing: P[] };

/**
 * How far an announcement got among the people working now: an ack of a person since fired
 * counts for nobody, so the figure never reads «10 из 9».
 */
export function reachOf<P extends { id: string }>(acks: readonly { user_id: string }[], team: readonly P[]): Reach<P> {
  const read = new Set(acks.map((ack) => ack.user_id));
  const missing = team.filter((person) => !read.has(person.id));
  return { seen: team.length - missing.length, of: team.length, missing };
}

export type EtherParts<T> = { held: { item: T; until: string }[]; sent: T[] };

/**
 * What still waits and what has gone. The soonest to go first, then the newest; a moment already
 * past is no longer waiting, whatever the last read of the outbox said.
 */
export function splitEther<T extends { id: string; created_at: string }>(items: readonly T[], held: Readonly<Record<string, string>> | undefined, now: Date): EtherParts<T> {
  const parts: EtherParts<T> = { held: [], sent: [] };
  for (const item of items) {
    const until = held?.[item.id];
    if (until && new Date(until) > now) parts.held.push({ item, until });
    else parts.sent.push(item);
  }
  parts.held.sort((a, b) => a.until.localeCompare(b.until));
  parts.sent.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return parts;
}
