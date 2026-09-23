import { normalize } from "@/lib/text/normalize";

import type { Errand } from "./queries";

/**
 * What the secretary's own face is doing (D-87): the job of the request in hand, drawn — a
 * coffee machine, a teapot, the «не беспокоить» sign, the door opened for a guest. The scene
 * is read off the catalogue code of the default buttons; a button the director added later
 * (its code is its label in latin letters) is recognised by the words of its label, and
 * anything else is a note being taken — no company is named here (V-02).
 */
export type DeskScene = "coffee" | "tea" | "dnd" | "guest" | "doctor" | "come" | "other";

/**
 * rest — nobody asks: typing at the laptop; asked — a request nobody has taken yet: the
 * headset rings and the face hops until somebody says «Принял»; doing — the job itself;
 * done — the short cheer after «Готово».
 */
export type DeskPhase = "rest" | "asked" | "doing" | "done";

const BY_CODE: Record<string, DeskScene> = {
  coffee: "coffee",
  tea: "tea",
  dnd: "dnd",
  guest: "guest",
  doctor: "doctor",
  come: "come",
};

/** Word starts, checked on the normalised label: «Кофе с молоком», «Чайку», «Гостя в кабинет». */
const BY_WORD: [RegExp, DeskScene][] = [
  [/(^| )(коф|латте|капуч|эспрессо|американо)/, "coffee"],
  [/(^| )ча[йюяе]/, "tea"],
  [/беспоко|(^| )никого|тишин/, "dnd"],
  [/(^| )(гост|посетит|визитер)/, "guest"],
  [/(^| )(врач|доктор|медик|скор)/, "doctor"],
  [/(^| )(зайд|подойд|ко мне)/, "come"],
];

export function sceneOf(errand: Pick<Errand, "kind" | "label">): DeskScene {
  const byCode = BY_CODE[errand.kind];
  if (byCode) return byCode;
  const label = normalize(errand.label);
  for (const [pattern, scene] of BY_WORD) if (pattern.test(label)) return scene;
  return "other";
}

export type DeskFocus = { scene: DeskScene | null; phase: DeskPhase; errand: Errand | null };

const newestFirst = (a: Errand, b: Errand) => b.created_at.localeCompare(a.created_at);

/**
 * The one request the face acts out. A request nobody has taken comes first — somebody has
 * to say «Принял», and a face that hops is how the room hears it; then the job this secretary
 * has in hand; then «не беспокоить», whoever took it, because it is a state of the director's
 * door rather than a job, and it outlasts coffee and guests.
 */
export function deskFocus(errands: readonly Errand[], meId: string): DeskFocus {
  const sent = errands.filter((e) => e.status === "sent").sort(newestFirst);
  if (sent[0]) return { scene: sceneOf(sent[0]), phase: "asked", errand: sent[0] };

  const mine = errands.filter((e) => e.status === "accepted" && e.claimed_by === meId).sort(newestFirst);
  const job = mine.find((e) => sceneOf(e) !== "dnd");
  if (job) return { scene: sceneOf(job), phase: "doing", errand: job };

  const guarded = errands.filter((e) => e.status === "accepted" && sceneOf(e) === "dnd").sort(newestFirst);
  if (guarded[0]) return { scene: "dnd", phase: "doing", errand: guarded[0] };

  return { scene: null, phase: "rest", errand: null };
}

/**
 * A job of this secretary that has just been closed between two reads of the list — the face
 * cheers for it once. Only «Готово» counts: a declined or cancelled request is no reason.
 */
export function justDone(prev: readonly Errand[], next: readonly Errand[], meId: string): Errand | null {
  const before = new Map(prev.map((row) => [row.id, row.status]));
  return next.find((row) => row.status === "done" && row.claimed_by === meId && before.get(row.id) === "accepted") ?? null;
}

function lower(label: string): string {
  return label.charAt(0).toLowerCase() + label.slice(1);
}

/** What the face is doing, in the first person — no gender in a present-tense verb (DESIGN §4). */
const DOING: Record<DeskScene, string> = {
  coffee: "Варю кофе",
  tea: "Завариваю чай",
  dnd: "К директору никого не пускаю",
  guest: "Приглашаю гостя в кабинет",
  doctor: "Вызываю врача",
  come: "Иду к директору",
  other: "",
};

/** The line under the face on the secretary's home: the moment in a few words. */
export function deskLine(focus: DeskFocus): string {
  const { errand, phase, scene } = focus;
  if (phase === "rest" || !errand || !scene) return "Заявок нет — на месте";
  if (phase === "asked") return `Директор просит: ${lower(errand.label)}`;
  if (phase === "done") return `Готово · ${lower(errand.label)}`;
  return DOING[scene] || `В работе: ${lower(errand.label)}`;
}
