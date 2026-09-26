import { OPEN_CREW, urgencyOf, type CrewTask } from "@/lib/idle/look";
import { isOverdue, type TaskStatus } from "@/lib/tasks/status-text";

/**
 * The team on the waiting screen (D-90, a real company in D-91, circles since D-118).
 *
 * Two halves with the face between them, and everybody in them is the same circle of the same
 * size: below the face the idlers, grey, in their rows (D-72); above it the people with work,
 * lit in the colour of the stage, with a ring that says whether the work is moving
 * (lib/idle/look.ts). Give an idler a task and his circle flies through the face and comes out
 * lit above; his last task accepted, it goes out and floats back down.
 *
 * A person's place is his place in a fixed order — by name — so he keeps it whoever comes and
 * goes; when somebody leaves a row the others slide over (the screen animates it).
 */

export type Person = { id: string; fullName: string; alias: string | null };
/** A person and what he carries, as the board already knows it. */
export type Member = Person & { tasks: CrewTask[] };

/**
 * A person picked on the screen (D-84): who, what goes in front of the phrase («Марату, »), and
 * where his circle is, px from the middle of the face — for the face to look at.
 */
export type Pick = { id: string; name: string; address: string; x: number; y: number };

/**
 * One row of the director's board, the part this screen reads. The board holds the whole
 * company's open tasks, so the team costs no query of its own.
 */
export type BoardRow = {
  id: string;
  assignee_id: string | null;
  status: TaskStatus;
  deadline: string | null;
  title: string;
  /** the employee's unanswered question, when there is one */
  question?: string | null;
  /** the deadline the employee asks for, while unanswered (D-128) */
  request?: string | null;
  decline_reason?: string | null;
  /** an unread word in the thread (lib/pulse/board.ts `hasUnread`) */
  unread?: boolean;
};

/**
 * Everybody's tasks, loudest first. A task just accepted (`done`) is kept too — a closed task
 * stays on the board's cache until the next fetch, and the screen needs it for the moment the
 * ring closes in gold; the screen decides how long that moment lasts.
 */
export function tasksOf(rows: BoardRow[], now: number): Record<string, CrewTask[]> {
  const byPerson: Record<string, CrewTask[]> = {};
  const at = new Date(now);
  for (const row of rows) {
    if (!row.assignee_id) continue;
    if (!OPEN_CREW.includes(row.status) && row.status !== "done") continue;
    (byPerson[row.assignee_id] ??= []).push({
      id: row.id,
      title: row.title,
      status: row.status,
      overdue: isOverdue(row, at),
      question: row.question ?? null,
      request: row.request ?? null,
      unread: Boolean(row.unread),
      reason: row.decline_reason ?? null,
      href: `/tasks/${row.id}`,
    });
  }
  for (const tasks of Object.values(byPerson)) tasks.sort((a, b) => urgencyOf(a) - urgencyOf(b));
  return byPerson;
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

/** What goes in front of the phrase when the director picks him: the name he is called by. */
export function addressOf(person: Person): string {
  return `${person.alias ?? firstNameOf(person.fullName)}, `;
}

/**
 * How far under the middle of the face the assistant's own words reach. While the microphone
 * is open a pill with the stage and the timer hangs right under the head, and «веди вверх,
 * чтобы отменить» under that (components/pulse/MascotLever.tsx): the box of the face is 76 px
 * of it and the two lines another 50. The floor starts below all of that — the first row used
 * to stand on those words exactly while the director was talking (владелец, 2026-09-18).
 */
export const SKIRT = 126;
/** Above the face the thought and the pick card come out: the sky stops short of them. */
export const CLEAR_TOP = 112;
/** The ring stands this far out of a circle. */
export const RING_OUT = 5;

/** One size for everybody, from the size of the team: a dozen gets big circles, fifty small ones. */
export function sizeFor(count: number): number {
  if (count <= 12) return 44;
  if (count <= 24) return 40;
  if (count <= 40) return 36;
  return 32;
}

/** Room for the ring round a circle and a gap to the next one: a finger target of 44 px or more. */
export function spacingFor(size: number): number {
  return size + 18;
}

export type Seat = { id: string; x: number; y: number };
export type TeamLayout = {
  seats: Map<string, Seat>;
  /** people who did not fit, above and below: counted, not drawn */
  overflow: { top: number; bottom: number };
  size: number;
  spacing: number;
};

/** FNV-1a: the couple of pixels a person stands off his row — his own, the same every time. */
export function hashOf(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The team laid out: everybody with work above the face, the rest below it, in rows.
 *
 * `hx`/`hy` — half the play area, px from the middle of the face. `wide`/`reach` — how far the
 * rows may stand, when that is further: the area is cut short so a flying dream never clips the
 * edge of the screen, and a circle that stands still needs no such room — on a short phone
 * that margin is a whole row of people.
 */
export function teamField({
  people,
  hx,
  hy,
  wide,
  reach,
}: {
  people: { id: string; fullName: string; busy: boolean }[];
  hx: number;
  hy: number;
  wide?: number;
  reach?: number;
}): TeamLayout {
  const size = sizeFor(people.length);
  const spacing = spacingFor(size);
  const width = Math.max(hx, wide ?? hx);
  const height = Math.max(hy, reach ?? hy);
  const perRow = Math.max(1, Math.floor((width * 2) / spacing));
  const seats = new Map<string, Seat>();
  // the order of the names, so a person keeps his place however the roster happens to arrive
  const ordered = [...people].sort((a, b) => a.fullName.localeCompare(b.fullName, "ru") || a.id.localeCompare(b.id));

  // rows centred, filled from `first` towards `last`; as many as fit, the rest are counted
  const rows = (list: { id: string }[], first: number, last: number) => {
    const fit = last < first ? 0 : Math.floor((last - first) / spacing) + 1;
    const shown = list.slice(0, fit * perRow);
    shown.forEach((person, i) => {
      const row = Math.floor(i / perRow);
      const inRow = i % perRow;
      const count = Math.min(perRow, shown.length - row * perRow);
      // a row of people, not a table of cells: everybody stands a pixel or two off the line
      const h = hashOf(person.id, 5);
      seats.set(person.id, {
        id: person.id,
        x: Math.round((inRow - (count - 1) / 2) * spacing + ((h % 5) - 2)),
        y: Math.round(first + row * spacing + (((h >>> 8) % 3) - 1)),
      });
    });
    return list.length - shown.length;
  };

  const edge = size / 2 + RING_OUT;
  // the sky reads from the top down, like a board of who is at work; the floor from under the
  // words under the face downwards
  const top = rows(
    ordered.filter((p) => p.busy),
    -height + edge,
    -CLEAR_TOP - edge,
  );
  const bottom = rows(
    ordered.filter((p) => !p.busy),
    SKIRT + 14 + edge,
    height - edge,
  );
  return { seats, overflow: { top, bottom }, size, spacing };
}
