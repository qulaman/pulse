import { BoardSandbox } from "./BoardSandbox";
import { BOARD_CASES } from "./fixtures";

/**
 * /dev/board?case=empty|few|branches|many|long|offline|waits|onwall|recording — the board of
 * «Заметки» (D-102, D-121) on fixtures (dev only): no login, no shared database, the wall is
 * not touched. Phone screenshots at 375×667 and 412×915 come from here.
 */
export default async function BoardSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const which = BOARD_CASES.find((item) => item === params.case) ?? "branches";
  return <BoardSandbox key={which} which={which} />;
}
