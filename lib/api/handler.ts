import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { ZodType } from "zod";

import { AuthError, authErrorMessageRu, getSessionProfile, requireRole, type Role, type SessionProfile } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env.public";
import { isGuid } from "@/lib/ops/guard";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { apiError } from "./respond";

export type HandlerContext<TBody> = {
  req: Request;
  profile: SessionProfile;
  body: TBody;
  /** Resolved dynamic segments — `/api/tasks/[id]/...` needs the id. */
  params: Record<string, string>;
};

type RouteContext = { params: Promise<Record<string, string>> };

type Handler<TBody> = (ctx: HandlerContext<TBody>) => Promise<Response>;

const INTERNAL_MESSAGE = "Что-то пошло не так, попробуйте ещё раз";

/** What a route answers when the `[id]` of its address is not an id at all: a 404 with these words. */
export type IdRefusal = { code: string; message: string };

export const TASK_ID: IdRefusal = { code: "task_not_found", message: "Задача не найдена" };
export const PERSON_ID: IdRefusal = { code: "not_found", message: "Сотрудник не найден" };

/**
 * auth → `[id]` → zod → handler, with the error contract of docs/BACKEND.md §0.
 * `roles: 'any'` means "any active profile"; getSessionProfile already
 * rejects a disabled account with 403 `inactive`. `options.id` — the address carries an `[id]`:
 * one that is not a guid is answered 404 before anything is read.
 */
export function withAuth<TBody = unknown>(
  roles: Role[] | "any",
  fn: Handler<TBody>,
  schema?: ZodType<TBody>,
  options: { id?: IdRefusal } = {},
): (req: Request, ctx?: RouteContext) => Promise<Response> {
  return async (req: Request, ctx?: RouteContext) => {
    try {
      const profile = await getSessionProfile(req);
      if (roles !== "any") requireRole(profile, ...roles);

      const params = (ctx ? await ctx.params : undefined) ?? {};
      if (options.id && !isGuid(params.id ?? "")) return apiError(404, options.id.code, options.id.message);

      let body = undefined as TBody;
      if (schema) {
        let raw: unknown;
        try {
          raw = await req.json();
        } catch {
          return apiError(400, "validation_error", "Неверный запрос");
        }
        const parsed = schema.safeParse(raw);
        if (!parsed.success) {
          return apiError(400, "validation_error", "Неверный запрос");
        }
        body = parsed.data;
      }

      return await fn({ req, profile, body, params });
    } catch (error) {
      if (error instanceof AuthError) {
        return apiError(error.status, error.code, authErrorMessageRu(error.code));
      }
      // Never the request body and never a key — ai_logs and Vercel logs are readable.
      console.error("api handler failed:", error instanceof Error ? error.message : error);
      return apiError(500, "internal", INTERNAL_MESSAGE);
    }
  };
}

/**
 * Supabase client carrying the caller's identity, so RPCs run under their role
 * and RLS. Bearer token when the request has one (scripts, Telegram), cookies
 * otherwise — mirrors the session source picked by getSessionProfile().
 */
export async function userSupabase(req: Request) {
  const header = req.headers.get("authorization");
  const [scheme, token] = header?.split(" ") ?? [];
  if (scheme?.toLowerCase() === "bearer" && token) {
    const env = getPublicEnv();
    return createClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }
  return createServerSupabase();
}
