import { between, rng } from "@/lib/idle/random";

/**
 * The team on the waiting screen (D-69, rebuilt for a real company in D-71).
 *
 * The screen has two halves and the face sits between them:
 *
 *   above the face   everyone who has work on them, as small glowing points — a star field.
 *                    The bigger and brighter the point, the more is on that person. Nobody is
 *                    named up there: the top is not a roster, it is the volume of work in the
 *                    air, and it reads at a glance whether the company is busy.
 *   below the face   the idlers, as circles with their initials, drifting slowly. Nothing is
 *                    on them, and the director can catch one and hand him a task.
 *
 * Give an idler something to do and his circle flies **through the face** and is spat out
 * above as a star: the assistant is the machine that turns an idler into work. Close his last
 * task and the star sinks back down.
 *
 * Every spot is a hash of the person and the screen, not of the order of the list: a person
 * keeps his place while his neighbours come and go, and the flight up always starts where he
 * was standing and ends where his star will be.
 */

export type OrbTone = "idle" | "green" | "yellow" | "red";

/**
 * What a star says about the director's own task, not about the person carrying it (D-73).
 * The point of the sky is that he reads the stage of his work from across the room:
 *
 *   nova     выдана, ещё не принял — a supernova: the loudest thing up there, and the first
 *            thing he sees right after he has given it;
 *   work     принята и делается — yellow, the calm one;
 *   review   сдана, ждёт его приёмки — green: done, and now it waits for him;
 *   alarm    вопрос, «не могу» или просрочка — red.
 */
export type StarStage = "nova" | "work" | "review" | "alarm";

/** Which stage shouts louder when one person carries several tasks at once. */
const STAGE_RANK: Record<StarStage, number> = { alarm: 0, nova: 1, review: 2, work: 3 };

/** One task of his, as the star card shows it. */
export type StarTask = { id: string; title: string; stage: StarStage };

/** What one person's day looks like, as the board already knows it. */
export type Load = {
  /** the loudest stage among his tasks — the colour of his star */
  stage: StarStage;
  /** his tasks, loudest first: the card over a star shows the first few */
  tasks: StarTask[];
  /** open tasks on them right now */
  active: number;
  overdue: number;
  /** the nearest deadline among them, ISO */
  nearest: string | null;
  /** handed in and waiting for the director */
  review: number;
};

export type Person = { id: string; fullName: string; alias: string | null; available: boolean };

/**
 * How far under the middle of the face the assistant's own words reach. While the microphone
 * is open a pill with the stage and the timer hangs right under the head, and «веди вверх,
 * чтобы отменить» under that (components/pulse/MascotLever.tsx): the box of the face is 76 px
 * of it and the two lines another 50. The floor starts below all of that — the first row used
 * to stand on those words exactly while the director was talking (владелец, 2026-09-18).
 */
const SKIRT = 126;

export type Orb = {
  id: string;
  /** what goes into the typed input when he is caught: «Марату, » */
  address: string;
  initials: string;
  name: string;
  tone: OrbTone;
  /** true — a star above the face; false — an idler drifting below it */
  working: boolean;
  load: Load;
  /** where he is now, px from the centre of the face */
  x: number;
  y: number;
  /** where he stands as an idler, and where his star hangs — the two ends of the flight */
  idleX: number;
  idleY: number;
  starX: number;
  starY: number;
  /** the drawn size in each of the two lives */
  size: number;
  starSize: number;
  /** 0 — a plain point (one task); 4 — a sparkle (a loaded one) */
  points: 0 | 4;
  /** the lazy drift of an idler */
  dx: number;
  dy: number;
  driftMs: number;
  /** how fast his star twinkles */
  beatMs: number;
  delayMs: number;
};

/**
 * The statuses that mean «this is still in the air». Handed in and waiting for the director
 * counts too: the work is not over, it is on the other side of the table — and the team screen
 * counts it the same way, so a person is never a star here and grey there. Only its deadline
 * stops being his problem.
 */
const OPEN = ["sent", "accepted", "in_progress", "rework", "pending_review"];

/** A task the employee refused is still the director's to settle: it keeps him in the sky. */

/**
 * What every person is carrying, read off the board the screen already has. The director's
 * board holds the whole company's open tasks, so this costs no query of its own.
 */
export type BoardRow = {
  id: string;
  assignee_id: string | null;
  status: string;
  deadline: string | null;
  title: string;
  /** the employee's unanswered question, when there is one */
  question?: string | null;
  decline_reason?: string | null;
};

/** The stage of one task, as the sky tells it. */
export function stageOf(task: BoardRow, now: number): StarStage {
  if (task.status === "declined" || task.question) return "alarm";
  if (task.status === "pending_review") return "review";
  if (task.deadline && new Date(task.deadline).getTime() < now) return "alarm";
  return task.status === "sent" ? "nova" : "work";
}

export function loadsOf(tasks: BoardRow[], now: number): Record<string, Load> {
  const loads: Record<string, Load> = {};
  for (const task of tasks) {
    if (!task.assignee_id) continue;
    const load = (loads[task.assignee_id] ??= { active: 0, overdue: 0, nearest: null, review: 0, stage: "work", tasks: [] });
    if (!OPEN.includes(task.status) && task.status !== "declined") continue;
    const stage = stageOf(task, now);
    load.tasks.push({ id: task.id, title: task.title, stage });
    if (task.status === "declined") continue;
    load.active += 1;
    const handedIn = task.status === "pending_review";
    if (handedIn) load.review += 1;
    if (!task.deadline || handedIn) continue;
    if (new Date(task.deadline).getTime() < now) load.overdue += 1;
    if (!load.nearest || task.deadline < load.nearest) load.nearest = task.deadline;
  }
  for (const load of Object.values(loads)) {
    load.tasks.sort((a, b) => STAGE_RANK[a.stage] - STAGE_RANK[b.stage]);
    load.stage = load.tasks[0]?.stage ?? "work";
  }
  return loads;
}

export function initialsOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "•";
}

/** The team screen's own rule, kept in one place so the two screens cannot drift apart. */
export function toneOf(load: Load | undefined, available: boolean, now: number): OrbTone {
  if (!available || !load || load.active === 0) return "idle";
  if (load.overdue > 0) return "red";
  if (load.nearest && new Date(load.nearest).getTime() < now + 24 * 3_600_000) return "yellow";
  return "green";
}

/** A stable number for a person, so his place is his own and does not move with the list. */
function hashOf(id: string, salt: number): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i += 1) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * The team, laid out over the two halves of the screen.
 *
 * `max` caps what is drawn, not what is true: with a company of fifty the star field would
 * take every point it can carry, and the idlers keep their own quota — they are what the
 * bottom half is for.
 */
export function peopleField({
  people,
  loads,
  hx,
  hy,
  seed,
  now,
  reach,
  hole = 104,
  maxStars = 28,
  maxIdlers = 12,
}: {
  people: Person[];
  loads: Record<string, Load>;
  hx: number;
  hy: number;
  seed: number;
  now: number;
  /**
   * How far down the floor may stand, when that is further than the play area. The area is cut
   * short at the bottom so a flying figure never clips the edge of the screen; a circle that
   * stands still needs no such room, and on a short phone that margin is a whole row of people.
   */
  reach?: number;
  /** the face keeps this much room to itself, and the two halves start beyond it */
  hole?: number;
  /**
   * What is drawn, not what is true. A sky of thirty already reads as «busy» and a floor of a
   * dozen is more than the director will ever catch in one sitting; past that it is only
   * paying for nodes nobody counts. Measured: this is what keeps a 50-person company at a
   * comfortable frame on a throttled phone.
   */
  maxStars?: number;
  maxIdlers?: number;
}): Orb[] {
  const all = people.map((person) => {
    const load = loads[person.id] ?? { active: 0, overdue: 0, nearest: null, review: 0, stage: "work" as StarStage, tasks: [] };
    return { person, load, tone: toneOf(load, person.available, now) };
  });
  // carrying anything at all puts him in the sky — including a task he has refused, which is
  // not work on him any more but is still the director's to settle
  const carrying = (p: (typeof all)[number]) => p.load.tasks.length > 0 || p.load.active > 0;
  const working = all.filter(carrying);
  const idlers = all.filter((p) => !carrying(p));

  // The loudest stars first, so a cut-off sky still shows the ones that need him. An overdue
  // deadline counts as loud on its own, whatever stage the tasks are in: a sky that drops it
  // to fit one more calm star would be hiding exactly what the director came to see.
  const loudness = (l: Load) => (l.overdue > 0 ? -1 : STAGE_RANK[l.stage]);
  const stars = [...working].sort((a, b) => loudness(a.load) - loudness(b.load) || b.load.active - a.load.active).slice(0, maxStars);
  // the rows are filled in a fixed order, so a person keeps his place in them however the
  // roster happens to arrive and whoever else comes and goes
  const queue = [...idlers].sort((a, b) => a.person.fullName.localeCompare(b.person.fullName, "ru") || a.person.id.localeCompare(b.person.id)).slice(0, maxIdlers);

  // the bands: the stars keep the top, the idlers the bottom, and the face keeps the middle
  const skyTop = -hy;
  const skyBottom = -Math.round(hole * 0.62);
  const floorTop = Math.round(hole * 0.62);
  // a crowded floor holds smaller circles — a dozen of them still have to fit and be tappable
  const idleSize = Math.max(28, Math.round(42 - queue.length * 0.8));

  /**
   * The floor stands in rows, it is not scattered (владелец, D-72): people waiting for work
   * line up, and a scatter of them reads as mess. The rows are centred, they fill from the top
   * of the floor downwards, and everybody gets a couple of pixels of his own, so it stays a
   * row of people and does not become a table of cells.
   */
  const cell = idleSize + 12;
  const perRow = Math.max(1, Math.floor((hx * 2) / cell));
  const rowGap = idleSize + 14;
  // The first row clears the face completely — a row runs through the middle, and that is
  // exactly where the face is — and it also clears the words under the head.
  const firstRow = Math.max(floorTop + idleSize / 2, hole + idleSize / 2 + 6, SKIRT + 14 + idleSize / 2);
  // and only as many rows as the floor actually has room for. Squeezing the rest in would
  // stack them on top of each other, which is what a short screen used to do: twelve people
  // drawn, four of them visible and eight hidden behind them.
  const floorBottom = Math.max(hy, reach ?? hy);
  const rowsFit = Math.max(1, Math.floor((floorBottom - idleSize / 2 - firstRow) / rowGap) + 1);
  const floor = queue.slice(0, rowsFit * perRow);
  const floorSpot = (index: number, jitter: () => number) => {
    const row = Math.floor(index / perRow);
    const inRow = index % perRow;
    const count = Math.min(perRow, floor.length - row * perRow);
    return {
      x: Math.round((inRow - (count - 1) / 2) * cell + (jitter() - 0.5) * 8),
      y: Math.round(Math.min(floorBottom - idleSize / 2, firstRow + row * rowGap) + (jitter() - 0.5) * 6),
    };
  };

  const placed: Orb[] = [];
  const spot = (id: string, salt: number, top: number, bottom: number, spread: number, tries: number) => {
    const random = rng(hashOf(id, seed + salt));
    let best = { x: 0, y: 0, gap: -1 };
    for (let i = 0; i < tries; i += 1) {
      const x = Math.round(between(random, -hx, hx));
      const y = Math.round(between(random, top, bottom));
      if (Math.hypot(x, y) < hole) continue;
      // keep the roomiest of the tries: a field that never overlaps is a grid, and a grid
      // reads as a table, not as a crowd
      const gap = placed.length ? Math.min(...placed.map((o) => Math.hypot(o.x - x, o.y - y))) : Infinity;
      if (gap > best.gap) best = { x, y, gap };
      if (gap > spread) break;
    }
    return best;
  };

  for (const { person, load, tone } of [...stars, ...floor]) {
    const isStar = tone !== "idle";
    const first = person.fullName.split(/\s+/)[0] ?? person.fullName;
    const random = rng(hashOf(person.id, seed + 99));
    // both ends of the flight are known for everyone, so the trip up has somewhere to land
    // the stars keep more room between them than a point needs: since D-73 a star is a tap
    // target too, and targets that overlap open the wrong card
    const sky = spot(person.id, 1, skyTop, skyBottom, 38, 30);
    // where he stands in the rows: his own place in the floor's order, not a random spot
    const floorIndex = floor.findIndex((p) => p.person.id === person.id);
    const jitter = rng(hashOf(person.id, seed + 3));
    const ground = floorSpot(floorIndex >= 0 ? floorIndex : floor.length, jitter);
    // a loaded person is a bigger, brighter star: «свободен или загружен» without a number
    const starSize = Math.min(11, 5 + load.active * 1.5);
    placed.push({
      id: person.id,
      address: `${person.alias ?? first}, `,
      initials: initialsOf(person.fullName),
      name: first,
      tone,
      working: isStar,
      load,
      x: isStar ? sky.x : ground.x,
      y: isStar ? sky.y : ground.y,
      idleX: ground.x,
      idleY: ground.y,
      starX: sky.x,
      starY: sky.y,
      size: idleSize,
      starSize: Math.round(starSize),
      points: load.active >= 2 ? 4 : 0,
      // an idler does not wander anywhere any more: he stands in his row and shivers, the
      // way a man with nothing to do shifts from foot to foot (владелец, D-72)
      dx: Math.round(between(random, -1, 1) * 14) / 10,
      dy: Math.round(between(random, -1, 1) * 10) / 10,
      driftMs: Math.round(between(random, 520, 1_000)),
      // no two stars twinkle on the same beat, or the sky looks like a metronome
      beatMs: Math.round(between(random, 1_800, 4_200)),
      delayMs: -Math.round(between(random, 0, 12_000)),
    });
  }
  return placed;
}
