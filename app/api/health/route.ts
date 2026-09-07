import { NextResponse } from "next/server";

import pkg from "@/package.json" with { type: "json" };

export const dynamic = "force-dynamic";

// Liveness probe: no DB, no AI — answers as long as the deployment is up.
export function GET() {
  return NextResponse.json({
    ok: true,
    version: pkg.version,
    time: new Date().toISOString(),
  });
}
