import type { TvLoadRow, TvRatingRow } from "./queries";

import { initialsOfName } from "./focus";

/**
 * Сцена «Команда» v5 (D-182) — кто в команде и кто уже сдал сегодня. Чистая функция: правило
 * «что можно по имени на стену» проверяется тестом.
 *
 * Порядок — по имени и не меняется: сортировка по числу дел читалась рейтингом загруженности.
 * У человека — «✓ N сдано сегодня» или ничего: ни «дел нет», ни серой точки, ни просрочки (D-45).
 * Медаль первой тройки — значком, только при очках и не гостю (D-33).
 */

/** A row of `tv_summary().load`: `done_today` arrives with the wall v5 summary (I1); an older base has none. */
export type TeamLoadRow = TvLoadRow;

export type TeamMember = {
  key: string;
  /** «Айгерим С.» — the first name and the surname's initial; a guest's row is a first name already. */
  name: string;
  initials: string;
  done: number | null;
  medal: 1 | 2 | 3 | null;
};

export type TeamDensity = {
  /** Circles in a row. */
  cols: number;
  /** The circle's diameter, vh (it gives way to big type, see TvTeam). */
  circle: number;
  /** The name's type step. */
  name: "tv-lead" | "tv-text" | "tv-caption";
  /** The scene's heading: a full grid takes a smaller one and keeps the room for people. */
  heading: "tv-title" | "tv-lead";
  /** Room is short: «✓ 3» stands in the circle instead of a line «✓ 3 сдано сегодня» under the name. */
  badge: boolean;
  /** A crowd: the first name alone, the surname's initial only for namesakes. */
  firstOnly: boolean;
};

export type TeamView = { members: TeamMember[]; density: TeamDensity; doneToday: number };

/** «Айгерим Сапарова» → «Айгерим С.»; one word stays as it is. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}.`;
}

/**
 * How many in a row and how big: the grid shrinks to fit, it never cuts anybody off. Up to eight
 * — big circles in two rows of four; up to 40 still fits the middle of a 16:9 wall at «далеко».
 */
export function teamDensity(count: number): TeamDensity {
  const roomy = { heading: "tv-title", badge: false, firstOnly: false } as const;
  if (count <= 4) return { ...roomy, cols: Math.max(1, count), circle: 16, name: "tv-lead" };
  if (count <= 8) return { ...roomy, cols: 4, circle: 14, name: "tv-lead" };
  // from nine on a row is six wide: «✓ 3 сдано сегодня» no longer fits under a name at «далеко» — it sits on the circle
  if (count <= 12) return { cols: 6, circle: 11, name: "tv-text", heading: "tv-title", badge: true, firstOnly: false };
  if (count <= 18) return { cols: 6, circle: 10, name: "tv-text", heading: "tv-title", badge: true, firstOnly: false };
  if (count <= 24) return { cols: 8, circle: 9, name: "tv-caption", heading: "tv-lead", badge: true, firstOnly: false };
  if (count <= 32) return { cols: 8, circle: 7, name: "tv-caption", heading: "tv-lead", badge: true, firstOnly: true };
  return { cols: 10, circle: 6, name: "tv-caption", heading: "tv-lead", badge: true, firstOnly: true };
}

export function teamView(
  load: readonly TeamLoadRow[],
  rating: readonly TvRatingRow[],
  opts: { points: boolean; guest: boolean },
): TeamView {
  const medals = new Map<string, 1 | 2 | 3>();
  if (opts.points && !opts.guest) {
    for (const row of rating) {
      if ((row.points ?? 0) > 0 && row.rank >= 1 && row.rank <= 3) medals.set(row.name, row.rank as 1 | 2 | 3);
    }
  }
  const sorted = [...load].sort((a, b) => a.name.localeCompare(b.name, "ru"));
  const density = teamDensity(sorted.length);
  // a namesake steps up a form: «Ерлан» → «Ерлан Б.» → the full name; one person is never on the wall twice
  const forms = [
    (name: string) => (density.firstOnly ? (name.trim().split(/\s+/)[0] ?? "") : shortName(name)),
    shortName,
    (name: string) => name.trim(),
  ];
  const nameOf = (name: string, level: number) => forms[Math.min(level, forms.length - 1)](name);
  const levels = sorted.map(() => 0);
  for (let pass = 0; pass < forms.length; pass += 1) {
    const counts = new Map<string, number>();
    sorted.forEach((row, i) => counts.set(nameOf(row.name, levels[i]), (counts.get(nameOf(row.name, levels[i])) ?? 0) + 1));
    sorted.forEach((row, i) => {
      if ((counts.get(nameOf(row.name, levels[i])) ?? 0) > 1) levels[i] += 1;
    });
  }

  const members = sorted.map((row, index): TeamMember => {
    const done = typeof row.done_today === "number" && row.done_today > 0 ? row.done_today : null;
    return {
      key: `${row.name}-${index}`,
      name: nameOf(row.name, levels[index]),
      initials: initialsOfName(row.name),
      done,
      medal: medals.get(row.name) ?? null,
    };
  });
  return {
    members,
    density,
    doneToday: members.reduce((sum, member) => sum + (member.done ?? 0), 0),
  };
}
