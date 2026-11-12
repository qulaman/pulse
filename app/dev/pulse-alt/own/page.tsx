import { STATES, type StateId } from "@/app/dev/pulse-alt/fixtures";

import { mono, sans } from "./fonts";
import { Pulse, type Failure } from "./Pulse";

const IDS = new Set<string>(STATES.map((s) => s.id));
const FAILURES = new Set<string>(["short", "nomic", "stt", "kept"]);

/**
 * «Чей ход» — the director's Пульс redrawn around one question: whose move is it.
 * `?state=<id>` sets the starting state; `?fail=short|nomic|stt` shows the other ways a phrase
 * fails (the `kept` state is the no-network one); `?away=1` empties the secretary's chair.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const raw = typeof params.state === "string" ? params.state : "idle";
  const state = (IDS.has(raw) ? raw : "idle") as StateId;
  const failRaw = typeof params.fail === "string" ? params.fail : "";
  const fail = FAILURES.has(failRaw) ? (failRaw as Failure) : null;
  const away = params.away === "1";
  return (
    <div className={`${sans.variable} ${mono.variable}`}>
      <Pulse key={`${state}:${fail ?? ""}:${away ? 1 : 0}`} initial={state} fail={fail} secretaryAway={away} />
    </div>
  );
}
