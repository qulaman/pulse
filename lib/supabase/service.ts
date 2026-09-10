import "server-only";

import { createClient } from "@supabase/supabase-js";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "./types";

/**
 * Service-role client: bypasses RLS. Only for trusted server paths
 * (outbox delivery, cron, provisioning) — never behind a user request
 * without an explicit role check first.
 */
export function createServiceSupabase() {
  const url = getPublicEnv().NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Invalid environment variables — SUPABASE_SERVICE_ROLE_KEY is missing");
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
