import { TeamSandbox } from "./TeamSandbox";

/**
 * /dev/team?n=8|20|52[&auto=1] — the team on the waiting screen (D-118) on a made-up company
 * (dev only): the very scene Пульс draws — grey idlers in their rows below the face, lit circles
 * with their rings above it, the flight between them, the card of a person at work — with a
 * remote for what happens to the tasks and a shelf of every state of a circle.
 */
export default async function TeamSandboxPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const params = await searchParams;
  const n = Number(params.n);
  return <TeamSandbox initialCount={n === 8 || n === 52 ? n : 20} initialAuto={params.auto === "1"} />;
}
