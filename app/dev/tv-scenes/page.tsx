import { SCENES, type SceneCase } from "./scenes";
import { ScenesSandbox } from "./ScenesSandbox";

/**
 * /dev/tv-scenes?scene=team|team-6|team-18|team-24|team-40|focus|focus-few|focus-many|focus-clear|focus-empty|
 * task|task-new|task-review|task-done|calendar|calendar-month|calendar-empty|rating|rating-swap|day|day-quiet|week|
 * announcement|announcement-long|announcement-max|welcome|welcome-nologo|pace|pace-low|pace-high|pace-record
 * [&k=1|1.15|1.3][&guest=1]
 * — one scene of the wall on fixtures (dev only, D-182): the middle of the wall at 16:9 with the ticker's and the
 * footer's bands left empty. `k` is the remote's «Крупность»; `guest=1` applies the guest's mask (D-33).
 * The whole wall with its frame lives in /dev/tv.
 */
export default async function TvScenesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const scene: SceneCase = SCENES.find((s) => s === params.scene) ?? "team";
  const guest = params.guest === "1";
  const k = [1, 1.15, 1.3].find((value) => String(value) === params.k) ?? 1;
  const base = momentOf(params.at);
  return <ScenesSandbox key={`${scene}-${guest}-${k}`} scene={scene} guest={guest} k={k} base={base} />;
}

/** `?at=` pins the moment (ms or ISO) for screenshots that must not drift; by default — the request's now. */
function momentOf(at: string | undefined): number {
  const pinned = at ? Number(at) || Date.parse(at) : Number.NaN;
  return Number.isFinite(pinned) ? pinned : Date.now();
}
