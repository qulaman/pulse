import { BOARD_CASES, demoOf } from "./boardFixtures";
import { WallSandbox, type WallCase } from "./WallSandbox";

const CASES: readonly WallCase[] = [
  "face",
  "clock",
  "team",
  "calendar",
  "calendar-month",
  "calendar-empty",
  "board",
  "board-two",
  "board-pages",
  "board-hidden",
  ...BOARD_CASES,
  "focus",
  "focus-few",
  "focus-many",
  "focus-done",
  "focus-nopoints",
  "focus-empty",
  "rating",
  "rating-month",
  "rating-empty",
  "task",
  "task-review",
  "task-done",
  "carousel",
  "visit",
  "wait",
  "message",
  "message-long",
  "event",
  "night",
];

/**
 * /dev/tv?case=face|clock|team|calendar|calendar-month|calendar-empty|board|board-two|board-pages|board-hidden|board-branches|board-focus|board-map|board-map-focus|board-map-1…4|board-map-12|board-map-13|board-long|board-pages-branches|board-empty|focus|focus-few|focus-many|focus-done|focus-nopoints|focus-empty|rating|rating-month|rating-empty|task|task-review|task-done|carousel|visit|wait|message|message-long|event|night[&clock=analog][&guest=1][&demo=focus|view|1]
 * — the office wall on fixtures (dev only): every scene and notice of D-96, the board of D-102 and the secretary's
 * message of D-116 without a kiosk,
 * a login or the shared database. Screenshots at 1920×1080 and 1280×720 come from here. `&demo=` walks the board by
 * itself: the spotlight every 2 s (`focus`), list ↔ map (`view`), both (`1`) — for perf and frame-by-frame checks.
 */
export default async function TvSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const wallCase = CASES.find((c) => c === params.case) ?? "face";
  const clock = params.clock === "analog" ? "analog" : "digital";
  const guest = params.guest === "1";
  const demo = demoOf(params.demo);
  return <WallSandbox key={`${wallCase}-${clock}-${guest}-${demo}`} wallCase={wallCase} clock={clock} guest={guest} demo={demo} />;
}
