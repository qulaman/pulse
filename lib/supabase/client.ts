"use client";

import { createBrowserClient } from "@supabase/ssr";

import { getPublicEnv } from "@/lib/env.public";
import type { Database } from "./types";

type BrowserSupabase = ReturnType<typeof createClient>;

function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let singleton: BrowserSupabase | undefined;

/** Browser Supabase client. One instance per tab keeps a single auth listener. */
export function createBrowserSupabase(): BrowserSupabase {
  singleton ??= createClient();
  return singleton;
}
