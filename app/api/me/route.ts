import { NextResponse } from "next/server";

import { AuthError, authErrorMessageRu, getSessionProfile } from "@/lib/auth";

/**
 * Who is signed in. 401/403 — the sign-in is gone (SessionWatch leaves the screen); 503 — it
 * could not be checked right now, ask again later (D-182).
 */
export async function GET(req: Request) {
  try {
    const profile = await getSessionProfile(req);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message_ru: authErrorMessageRu(error.code) } },
        { status: error.status, headers: error.status === 503 ? { "retry-after": "30" } : undefined },
      );
    }
    throw error;
  }
}
