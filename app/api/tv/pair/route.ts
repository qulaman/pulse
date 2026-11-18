import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { apiError, apiOk } from "@/lib/api/respond";
import { deviceLabel } from "@/lib/login-code/code";
import { hashAddress, hashCode, sameOrigin } from "@/lib/login-code/server";
import { createServiceSupabase } from "@/lib/supabase/service";
import { generatePairCode, PAIR_TTL_SECONDS } from "@/lib/tv/pairing";

import {
  hashSecret,
  mintSession,
  newSecret,
  PAIR_COOKIE,
  PAIR_COOKIE_OPTIONS,
  pairRpc,
  type IssueAnswer,
  type PollAnswer,
} from "./pair-server";

/** A poll's answer is about this moment only: never kept by a cache on the way. */
function fresh(body: unknown): NextResponse {
  return NextResponse.json(body, { headers: { "cache-control": "no-store" } });
}

/**
 * A code for a wall (D-182) — no session: the screen does not belong to anybody yet. The answer
 * carries the code (shown on the wall, public by nature) and sets the screen's secret in an
 * httpOnly cookie: only this browser can pick up the session the director's confirmation makes.
 * The same browser asking again (a reload, a code that ran out) cancels its previous code.
 */
export async function POST(req: Request) {
  try {
    if (!sameOrigin(req)) return apiError(403, "forbidden", "Нет доступа");

    const jar = await cookies();
    const prev = jar.get(PAIR_COOKIE)?.value;
    const service = createServiceSupabase();
    const secret = newSecret();

    // six digits with a check: a clash with an open code is rare, a second draw settles it
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = generatePairCode();
      const { data, error } = await pairRpc<IssueAnswer>(service, "tv_pair_issue", {
        p_code_hash: hashCode(code),
        p_secret_hash: hashSecret(secret),
        p_ip_hash: hashAddress(req),
        p_device: deviceLabel(req.headers.get("user-agent")),
        p_prev_secret_hash: prev ? hashSecret(prev) : null,
        p_ttl_seconds: PAIR_TTL_SECONDS,
      });
      if (error) {
        if (error.message === "collision") continue;
        console.error("tv_pair_issue failed:", error.message);
        return apiError(502, "issue_failed", "Сервер не ответил — пробую ещё раз");
      }
      if (!data) break;
      if (!data.ok) {
        // the director has already confirmed this screen's code: it polls instead of a new code
        if (data.error === "confirmed") return apiError(409, "confirmed", "Экран уже подтверждён");
        return apiError(429, data.error, "С этого адреса слишком много кодов", { retry_after: data.retry_after ?? 60 });
      }
      jar.set(PAIR_COOKIE, secret, PAIR_COOKIE_OPTIONS);
      return apiOk({ code, id: data.id, expires_in: data.expires_in }, 201);
    }
    console.error("tv_pair_issue: no code after five draws");
    return apiError(502, "issue_failed", "Сервер не ответил — пробую ещё раз");
  } catch (error) {
    console.error("tv pairing issue failed:", error instanceof Error ? error.message : error);
    return apiError(500, "internal", "Сервер не ответил — пробую ещё раз");
  }
}

/**
 * The wall asks every few seconds, by its cookie only. «waiting» (with the seconds left by the
 * base's clock), «expired», «gone» — or the director has confirmed: the server mints the kiosk
 * user's session onto this answer, the way a code sign-in does (D-135), and drops the cookie.
 * A session that could not be minted is given back, so the next poll tries again.
 */
export async function GET() {
  try {
    const jar = await cookies();
    const secret = jar.get(PAIR_COOKIE)?.value;
    if (!secret) return fresh({ state: "none" });

    const service = createServiceSupabase();
    const { data, error } = await pairRpc<PollAnswer>(service, "tv_pair_poll", { p_secret_hash: hashSecret(secret) });
    if (error || !data) {
      console.error("tv_pair_poll failed:", error?.message ?? "no answer");
      return apiError(502, "poll_failed", "Сервер не ответил — пробую ещё раз");
    }

    if (data.state === "waiting") return fresh({ state: "waiting", id: data.id, expires_in: data.expires_in });
    if (data.state !== "confirmed") return fresh({ state: data.state });

    if (!(await mintSession(data.user_id))) {
      const released = await pairRpc<null>(service, "tv_pair_release", { p_id: data.id });
      if (released.error) console.error("tv_pair_release failed:", released.error.message);
      return apiError(502, "session_failed", "Не получилось подключить — пробую ещё раз");
    }
    jar.delete({ name: PAIR_COOKIE, path: PAIR_COOKIE_OPTIONS.path });
    return fresh({ state: "connected" });
  } catch (error) {
    console.error("tv pairing poll failed:", error instanceof Error ? error.message : error);
    return apiError(500, "internal", "Сервер не ответил — пробую ещё раз");
  }
}
