import "../../../desk/journal.css";
import "../../../desk/graphite.css";
import "../../../desk/planning.css";
import "../../../desk/boards.css";

import { SCREEN_CASES, type ScreenCase } from "../fixtures";
import { DeskScreenSandbox } from "./DeskScreenSandbox";

/**
 * /dev/screen/desk?case=… — the desk's «Экран» (D-153, D-182) on the remote's fixtures (`../fixtures.ts`): the same
 * cases, without the desk's shell and its login, cut off the network. The live wall in the bezel is the real `/tv`
 * (it shows its own login or nothing here); the panel, the receipt and «Сейчас на стене» are what is checked. Dev only.
 */
export default async function DeskScreenSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const screenCase: ScreenCase = SCREEN_CASES.find((value) => value === params.case) ?? "ether";
  return <DeskScreenSandbox key={screenCase} screenCase={screenCase} />;
}
