import "server-only";

import type { ZodType } from "zod";

import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";
import type { Json } from "@/lib/supabase/types";

import type { OpsAction, Write } from "./contract";
import { opsRpc, type JournalResult, type OpsClient } from "./db";
import { hostAllowed, isGuid, OPS_HEADERS, opsFailure, OpsRpcError, originAllowed, requestHost } from "./guard";
import { createOpsSupabase } from "./server";

type RouteContext = { params: Promise<Record<string, string>> };
export type OpsRoute = (req: Request, ctx?: RouteContext) => Promise<Response>;

type Scope<TBody> = { body: TBody; params: Record<string, string> };

/** Who may pass, for a route without a ticket; a ticket is the gate of the writing ones. */
type OpsGate =
  /** The sign-in steps: there is no finished session yet, the route asks `ops_login_state` itself. */
  | "open"
  /** A read: its `ops_*` under the operator's JWT runs `ops.assert` first. */
  | "read"
  /** The route's calls are service-only with no ticket: `ops.assert` is asked here. */
  | "operator";

type PlainSpec<TBody> = { gate: OpsGate; schema?: ZodType<TBody> };

type ActionSpec<TBody extends Write> = {
  action: OpsAction;
  schema: ZodType<TBody>;
  /** The company the ticket is bound to; null for an action that creates one. */
  company: (scope: Scope<TBody>) => string | null;
  /** What the journal keeps about the target; never a secret. */
  target: (scope: Scope<TBody>) => Json;
  /** A repeat's answer from the journal's `result`; `duplicate: true` is added here. Default: as kept. */
  replay?: (result: JournalResult, scope: Scope<TBody> & { service: OpsClient }) => unknown;
};

export type OpsContext<TBody, TTicket> = Scope<TBody> & {
  req: Request;
  /** Under the operator's JWT: the base asserts on it. */
  db: OpsClient;
  /** Service role, for the calls that take a ticket. */
  service: OpsClient;
  ticket: TTicket;
};

/** Stamped on every answer: a console answer is never kept or indexed. */
function stamp(response: Response): Response {
  for (const [name, value] of Object.entries(OPS_HEADERS)) response.headers.set(name, value);
  return response;
}

function refuse(status: number, code: string, message: string): Response {
  return stamp(apiError(status, code, message));
}

/** Any read that runs `ops.assert`: the check for routes with no call of their own under the JWT. */
export async function assertOperator(db: OpsClient): Promise<void> {
  await opsRpc(db, "ops_operators", {});
}

/**
 * The console's route (tasks/029): OPS_HOST → Origin on a write → cookie client → zod → gate or
 * ticket → `fn`. A repeat of a done request answers from the journal and `fn` never runs.
 */
export function withOps<TBody extends Write>(
  spec: ActionSpec<TBody>,
  fn: (ctx: OpsContext<TBody, string>) => Promise<Response>,
): OpsRoute;
export function withOps<TBody = undefined>(
  spec: PlainSpec<TBody>,
  fn: (ctx: OpsContext<TBody, null>) => Promise<Response>,
): OpsRoute;
export function withOps(
  spec: PlainSpec<unknown> | ActionSpec<Write>,
  fn: (ctx: OpsContext<never, never>) => Promise<Response>,
): OpsRoute {
  return async (req, ctx) => {
    try {
      const host = requestHost(req.headers);
      if (!hostAllowed(process.env.OPS_HOST, host)) return refuse(404, "not_found", "Не найдено");
      if (req.method !== "GET" && !originAllowed(req.headers.get("origin"), host)) {
        return refuse(403, "forbidden", "Нет доступа");
      }

      const db = await createOpsSupabase();
      // Next hands a route without segments a context whose `params` is undefined
      const params = (await ctx?.params) ?? {};
      if (params.id !== undefined && !isGuid(params.id)) return refuse(404, "not_found", "Не найдено");

      let body: unknown;
      if (spec.schema) {
        const raw: unknown = await req.json().catch(() => undefined);
        const parsed = spec.schema.safeParse(raw);
        if (!parsed.success) return refuse(400, "validation_error", "Неверный запрос");
        body = parsed.data;
      }

      const service = createServiceSupabase();
      let ticket: string | null = null;
      if ("action" in spec) {
        const scope = { body: body as Write, params };
        const outcome = await opsRpc(db, "ops_ticket", {
          p_action: spec.action,
          p_company: spec.company(scope),
          p_target: spec.target(scope),
          p_reason: scope.body.reason,
          p_client_request_id: scope.body.client_request_id,
        });
        if (outcome.duplicate) {
          const answer = spec.replay ? await spec.replay(outcome.result, { ...scope, service }) : outcome.result;
          return stamp(apiOk({ ...(answer as object), duplicate: true }));
        }
        ticket = outcome.ticket;
      } else if (spec.gate === "operator") {
        await assertOperator(db);
      }

      return stamp(await fn({ req, db, service, ticket, body, params } as never));
    } catch (error) {
      if (error instanceof OpsRpcError) {
        const failure = opsFailure(error.message, error.sqlstate);
        if (failure.status >= 500) console.error("ops call failed:", error.message);
        return refuse(failure.status, failure.code, failure.message_ru);
      }
      // Never the request body and never a key: Vercel logs are readable.
      console.error("ops handler failed:", error instanceof Error ? error.message : error);
      return refuse(500, "internal", "Что-то пошло не так, попробуй ещё раз");
    }
  };
}
