import type { PostgrestError } from "@supabase/supabase-js";

/**
 * The answer of an RPC that returns jsonb, read in its module's contract shape. The generated
 * types only say `Json`; the module's types say what is inside. The call itself stays fully typed
 * by supabase-js — `rpcJson<TeamDay>(supabase.rpc("team_daily_report_day", { p_date }))` — and
 * the answer is read as `T` here, once, instead of `as unknown as` at every caller.
 */
export async function rpcJson<T>(
  call: PromiseLike<{ data: unknown; error: PostgrestError | null }>,
): Promise<{ data: T; error: PostgrestError | null }> {
  const { data, error } = await call;
  return { data: data as T, error };
}
