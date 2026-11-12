import { STATES, type StateId } from "@/app/dev/pulse-alt/fixtures";

import { Strict } from "./Strict";

type Search = Record<string, string | string[] | undefined>;

/**
 * Contest entry «strict» (/dev/pulse-alt/strict?state=<id>). `fail=short|nomic|stt` swaps the
 * failure the `kept` state shows; `away=1` puts the secretary's whole office out until 14:00.
 */
export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const raw = typeof params.state === "string" ? params.state : "idle";
  const state: StateId = STATES.some((s) => s.id === raw) ? (raw as StateId) : "idle";
  const failRaw = typeof params.fail === "string" ? params.fail : "";
  const fail = failRaw === "short" || failRaw === "nomic" || failRaw === "stt" ? failRaw : null;
  const away = params.away === "1";
  return <Strict key={`${state}:${fail ?? ""}:${away ? 1 : 0}`} initial={state} fail={fail} away={away} />;
}
