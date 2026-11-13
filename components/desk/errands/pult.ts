import { humanAqtobe } from "@/lib/ai/time";
import { asksDirector } from "@/lib/desk/home";
import { isActive, waitedFor, type Errand, type SecretaryPerson } from "@/lib/errands/queries";
import { etaLeftMin, isAway, isPlanned, NUDGE_MS, SCENE_NAME, sceneOf, untilLine, type DeskScene } from "@/lib/errands/scene";
import { spanWords } from "@/lib/errands/stats";
import { shortName } from "@/lib/people/names";
import type { SecretaryAction } from "@/lib/settings";
import { pluralRu } from "@/lib/tasks/status-text";

/*
 * The words of the director's «Пульт» (D-175), apart from the drawing: what the secretary is doing in
 * one sentence, where each request stands in its biggest figure, what is «только что». Names give no
 * gender: «Марат несёт кофе», «взято · Марат», never «Марат взял».
 */

/** «Только что»: what closed within this long is news; earlier — the day's journal. */
export const RECENT_MS = 30 * 60_000;

const lower = (text: string) => (text ? text.charAt(0).toLowerCase() + text.slice(1) : text);

/** «09:14» on the Aqtobe clock — today's rows, the track's nodes. */
export function clockOf(iso: string, now: Date): string {
  return humanAqtobe(new Date(iso), now).replace(/^(сегодня|вчера|завтра) /, "");
}

export const isAlarmErrand = (errand: Errand, catalogue: readonly SecretaryAction[]) => isActive(errand) && (errand.urgent || sceneOf(errand, catalogue) === "security");
export const isDoor = (errand: Errand, catalogue: readonly SecretaryAction[]) => sceneOf(errand, catalogue) === "dnd";

/** The job in a secretary's hands: the newest taken request that is not the door nor planned for later. */
function jobOf(active: readonly Errand[], id: string, catalogue: readonly SecretaryAction[], now: Date): Errand | null {
  return (
    active
      .filter((errand) => errand.status === "accepted" && errand.claimed_by === id && !isDoor(errand, catalogue) && !isPlanned(errand, now))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null
  );
}

/** What the person is doing, in the third person, present tense — no gender in it. */
function doingOf(scene: DeskScene, errand: Errand): string {
  if (scene === "come") return "идёт к вам";
  if (scene === "other") return `— ${lower(errand.label)}`;
  return lower(SCENE_NAME[scene]);
}

export type BandRing = "ok" | "work" | "door" | "away" | "wait" | "alarm" | null;

export type Band = {
  /** The face the band shows: the one at work, else the first who is there. */
  face: SecretaryPerson | null;
  ring: BandRing;
  /** The job's scene, as a badge on the face. */
  scene: DeskScene | null;
  title: string;
  sub: string | null;
  /** Nothing goes on: the band shows the thirty days' facts. */
  calm: boolean;
};

/**
 * What is going on at the secretary's desk, in one sentence and a line under it (D-175): the alarm,
 * else the job in hand with its promise, else what nobody has taken yet, else the closed door, else
 * who is there. One sentence — the answers live in «Ждут вас», never here.
 */
export function bandOf(people: readonly SecretaryPerson[], active: readonly Errand[], catalogue: readonly SecretaryAction[], now: Date): Band {
  if (people.length === 0) {
    return { face: null, ring: null, scene: null, title: "Секретаря в компании нет", sub: "Просьбы передать некому — секретаря добавляют в «Команде»", calm: false };
  }
  const name = (person: SecretaryPerson | null | undefined) => shortName(person?.full_name ?? "") || "Секретарь";
  const byId = (id: string | null) => people.find((person) => person.id === id) ?? null;
  const there = people.filter((person) => !isAway(person, now));
  const away = people.filter((person) => isAway(person, now));
  const sent = active.filter((errand) => errand.status === "sent");
  const awayLine = (list: readonly SecretaryPerson[]) => list.map((person) => `${name(person)} не на месте ${untilLine(person.away_until as string)}`).join(" · ");

  // the alarm outranks everything (D-99)
  const alarm = active.find((errand) => isAlarmErrand(errand, catalogue));
  if (alarm) {
    const others = active.filter((errand) => errand.id !== alarm.id && !isDoor(errand, catalogue)).map((errand) => lower(errand.label));
    const rest = others.length > 0 ? `остальные просьбы ждут: ${others.slice(0, 3).join(" · ")}${others.length > 3 ? ` и ещё ${others.length - 3}` : ""}` : null;
    if (alarm.status === "accepted") {
      const who = byId(alarm.claimed_by);
      return { face: who, ring: "alarm", scene: "security", title: `${shortName(alarm.claimed?.full_name ?? who?.full_name ?? "") || "Секретарь"} вызывает охрану`, sub: rest, calm: false };
    }
    return { face: there[0] ?? people[0], ring: "alarm", scene: "security", title: "Охрана — ещё никто не взял", sub: rest ?? (there.length ? `${there.map(name).join(", ")} на месте` : awayLine(away)), calm: false };
  }

  // the job in hand of each secretary: the one at it leads the band
  // who is there leads: a job in the hands of somebody marked away is said after
  const jobs = [...there, ...away].flatMap((person) => {
    const job = jobOf(active, person.id, catalogue, now);
    return job ? [{ person, errand: job, scene: sceneOf(job, catalogue) }] : [];
  });
  const idleAway = away.filter((person) => !jobs.some((job) => job.person.id === person.id));
  if (jobs[0]) {
    const { person, errand, scene } = jobs[0];
    const left = etaLeftMin(errand, now);
    const promise = left === null ? null : left > 0 ? `будет через ${left} мин` : left >= -1 ? "вот-вот" : `опаздывает на ${-left} мин`;
    const more = active.filter((one) => one.status === "accepted" && one.id !== errand.id && !isDoor(one, catalogue)).length;
    const sub = [
      more > 0 ? `в работе ещё ${more}` : null,
      sent.length > 0 ? `${sent.length} ${pluralRu(sent.length, ["просьбу", "просьбы", "просьб"])} ещё никто не взял` : null,
      jobs.length > 1 ? jobs.slice(1).map((other) => `${name(other.person)} ${doingOf(other.scene, other.errand)}`).join(" · ") : null,
      idleAway.length > 0 ? awayLine(idleAway) : null,
    ].filter(Boolean);
    return {
      face: person,
      ring: "work",
      scene,
      title: `${name(person)} ${doingOf(scene, errand)}${promise ? ` · ${promise}` : ""}`,
      sub: sub.length ? sub.join(" · ") : null,
      calm: false,
    };
  }

  // asked, and nobody has it yet
  if (sent[0]) {
    const oldest = [...sent].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
    const title = sent.length === 1 ? `${oldest.label} — ещё никто не взял` : `${sent.length} ${pluralRu(sent.length, ["просьбу", "просьбы", "просьб"])} ещё никто не взял`;
    const waited = waitedFor(oldest, now);
    const sub = there.length > 0 ? `${waited === "только что" ? "" : `ждёт ${waited} · `}${there.map(name).join(", ")} на месте` : `${awayLine(away)} — просьба дождётся`;
    return { face: there[0] ?? people[0], ring: there.length > 0 ? "wait" : "away", scene: null, title, sub, calm: false };
  }

  // the director's door is closed: a state of the door, not a job
  const door = active.find((errand) => errand.status === "accepted" && isDoor(errand, catalogue));
  if (door) {
    const holder = byId(door.claimed_by);
    return {
      face: holder ?? there[0] ?? people[0],
      ring: "door",
      scene: "dnd",
      title: `${shortName(door.claimed?.full_name ?? holder?.full_name ?? "") || "Секретарь"} никого к вам не пускает`,
      sub: door.until_at ? `дверь закрыта ${untilLine(door.until_at)}` : null,
      calm: false,
    };
  }

  if (there.length === 0) {
    const back = [...away].sort((a, b) => (a.away_until ?? "").localeCompare(b.away_until ?? ""))[0];
    return {
      face: back,
      ring: "away",
      scene: null,
      title: people.length === 1 ? `${name(back)} не на месте ${untilLine(back.away_until as string)}` : `Никого нет на месте ${untilLine(back.away_until as string)}`,
      sub: "просьба дождётся — уйдёт, как только кто-то вернётся",
      calm: true,
    };
  }
  // planned requests ahead are quiet: the day is calm
  const planned = active.filter((errand) => errand.status === "accepted" && isPlanned(errand, now)).length;
  return {
    face: there[0],
    ring: "ok",
    scene: null,
    title: `${there.map(name).join(" и ")} на месте`,
    sub: [away.length > 0 ? awayLine(away) : null, planned > 0 ? `запланировано ${planned}` : "дел нет — просьба придёт сразу"].filter(Boolean).join(" · "),
    calm: true,
  };
}

export type TripTone = "sky" | "warn" | "pen" | "pencil" | "door" | "muted";

/** The biggest figure of a request on its way, and the word under it (D-175). */
export type TripFigure = { big: string; caption: string; tone: TripTone };

/** A card's biggest figure and the caption under it: the wait, the promise, the door's time, the work in hand. */
export function tripFigure(errand: Errand, now: Date): TripFigure {
  const at = now.getTime();
  const who = shortName(errand.claimed?.full_name ?? "");
  if (errand.status === "sent") {
    if (errand.due_at && isPlanned(errand, now)) return { big: clockOf(errand.due_at, now), caption: "к сроку", tone: "muted" };
    const waited = (at - new Date(errand.created_at).getTime()) / 60_000;
    return { big: spanWords(waited), caption: "ждёт · никто не взял", tone: waited * 60_000 >= NUDGE_MS ? "warn" : "sky" };
  }
  if (errand.until_at) {
    const left = (new Date(errand.until_at).getTime() - at) / 60_000;
    // its time is over, yet nobody has opened the door: said so, never «< 1 мин» for ever
    if (left <= 0) return { big: "истекло", caption: "дверь ещё не открыли", tone: "warn" };
    return { big: spanWords(left), caption: "до открытия двери", tone: "door" };
  }
  if (errand.due_at && isPlanned(errand, now)) return { big: clockOf(errand.due_at, now), caption: "к сроку", tone: "muted" };
  const left = etaLeftMin(errand, now);
  if (left !== null) {
    if (left > 0) return { big: spanWords(left), caption: who ? `обещано · ${who}` : "обещано", tone: "pen" };
    if (left >= -1) return { big: "вот-вот", caption: who ? `обещано · ${who}` : "обещано", tone: "pen" };
    return { big: `+${spanWords(-left)}`, caption: "опаздывает", tone: "pencil" };
  }
  const since = errand.accepted_at ? (at - new Date(errand.accepted_at).getTime()) / 60_000 : 0;
  return { big: spanWords(since), caption: who ? `в работе · ${who}` : "в работе", tone: "pen" };
}

/** Where a request stands on the track: 0 — asked, 1 — taken, 2 — done. */
export function stageOf(errand: Pick<Errand, "status">): 0 | 1 | 2 {
  return errand.status === "sent" ? 0 : errand.status === "accepted" ? 1 : 2;
}

/** How far the line toward «Готово» has come: the share of the promise that has passed. */
export function towardDone(errand: Errand, now: Date): number {
  if (errand.status !== "accepted" || !errand.eta_at || !errand.accepted_at) return 0;
  const span = new Date(errand.eta_at).getTime() - new Date(errand.accepted_at).getTime();
  if (span <= 0) return 1;
  return Math.max(0.06, Math.min(1, (now.getTime() - new Date(errand.accepted_at).getTime()) / span));
}

/** «Напомнить ещё раз»: nobody took it for `NUDGE_MS` (the phone's two minutes). */
export function canNudge(errand: Errand, now: Date): boolean {
  return errand.status === "sent" && now.getTime() - new Date(errand.created_at).getTime() >= NUDGE_MS;
}

/** Closed by the secretary today, the newest first — done and refused; taking back is the director's own. */
export function closedToday(rows: readonly Errand[], today: (iso: string | null, now: Date) => boolean, now: Date): Errand[] {
  return rows
    .filter((errand) => (errand.status === "done" || errand.status === "declined") && today(endOf(errand), now))
    .sort((a, b) => (endOf(b) ?? "").localeCompare(endOf(a) ?? ""));
}

/** When a closed request ended: done — its «готово», refused — its last change. */
export function endOf(errand: Errand): string | null {
  return errand.status === "done" ? (errand.done_at ?? errand.updated_at) : errand.updated_at;
}

/** Closed within `RECENT_MS`: «Только что». */
export function isRecent(errand: Errand, now: Date): boolean {
  const end = endOf(errand);
  return Boolean(end) && now.getTime() - new Date(end as string).getTime() <= RECENT_MS;
}

/** The secretary's question that waits for the director (D-99), the alarm aside. */
export function asksMe(errand: Errand, catalogue: readonly SecretaryAction[]): boolean {
  return asksDirector(errand) && !isAlarmErrand(errand, catalogue);
}
