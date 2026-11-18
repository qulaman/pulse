import { SCREEN_CASES, type ScreenCase } from "./fixtures";
import { ScreenSandbox } from "./ScreenSandbox";

/**
 * /dev/screen?case=ether|person|silent15|silent|sound|morning|manual|visitor|message|never|night — the director's TV
 * remote (D-76, D-96, D-121, D-123, D-182) without a login: the real remote (`components/screen/Remote.tsx`) in a phone
 * column on a made-up company with a stopped clock. The page is cut off the network before the remote mounts — no
 * fetch and no key pressed here reaches the database. The live wall in the display's sheet is `/dev/tv` on fixtures.
 * Without `case` the remote waits for a test driver, as before: it answers the requests itself (Playwright
 * `page.route`) and moves the wall through `window.__remoteQueryClient`. Dev only (app/dev/layout.tsx).
 * The desk's «Экран» on the same fixtures — `/dev/screen/desk?case=…`.
 */
export default async function ScreenSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const wallCase = SCREEN_CASES.find((value) => value === params.case) ?? null;
  return <ScreenSandbox key={wallCase ?? "driver"} screenCase={wallCase as ScreenCase | null} />;
}
