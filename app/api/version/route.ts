import { NextResponse } from "next/server";

import { BUILD } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * The build this server runs (D-115) — what a phone compares its own with. No session and
 * no DB: the login screen asks too, and the answer is baked into the build. Never cached,
 * or a phone would keep comparing against yesterday's deploy.
 */
export function GET() {
  return NextResponse.json(BUILD, { headers: { "cache-control": "no-store, max-age=0" } });
}
