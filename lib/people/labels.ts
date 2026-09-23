/**
 * Подпись клавиши человека на клавиатуре людей: имя, а при тёзках — имя и первая буква
 * фамилии («Ерлан Б.», «Ерлан Д.»). Порядок людей не меняется — клавиатура должна
 * запоминаться пальцами, поэтому горящая клавиша не переезжает наверх.
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
