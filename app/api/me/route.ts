import { NextResponse } from "next/server";

import { AuthError, authErrorMessageRu, getSessionProfile } from "@/lib/auth";

export async function GET(req: Request) {
  try {
    const profile = await getSessionProfile(req);
    return NextResponse.json({ profile });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: { code: error.code, message_ru: authErrorMessageRu(error.code) } },
        { status: error.status },
      );
    }
    throw error;
  }
}
