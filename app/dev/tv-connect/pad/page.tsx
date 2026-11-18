import { PadSandbox } from "./PadSandbox";

/**
 * /dev/tv-connect/pad — the remote's «Подключить экран» (D-182) in every state, without the API:
 * `?case=idle|typing|ready|several|which|pending|done|bad|typo|too-many|offline|no-screen`.
 * Dev only (app/dev/layout.tsx).
 */
export default async function PadSandboxPage({ searchParams }: { searchParams: Promise<{ case?: string }> }) {
  const { case: which = "idle" } = await searchParams;
  return <PadSandbox which={which} />;
}
