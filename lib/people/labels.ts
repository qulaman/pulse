/**
 * The label of a person's key on the people keyboard: the first name, and with namesakes the first name and the
 * surname's initial («Ерлан Б.», «Ерлан Д.»). The order of people does not change — the keyboard is
 * remembered by the fingers, so a lit key does not move to the top.
 */
export function keyLabels(people: { id: string; full_name: string }[]): Map<string, string> {
  const parts = people.map((p) => {
    const [first = "", ...rest] = p.full_name.trim().split(/\s+/);
    return { id: p.id, first: first || p.full_name, surname: rest[0] ?? "" };
  });
  const seen = new Map<string, number>();
  for (const p of parts) seen.set(p.first, (seen.get(p.first) ?? 0) + 1);
  return new Map(
    parts.map((p) => [
      p.id,
      (seen.get(p.first) ?? 0) > 1 && p.surname ? `${p.first} ${p.surname[0]}.` : p.first,
    ]),
  );
}
