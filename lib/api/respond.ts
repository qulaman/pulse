import { NextResponse } from "next/server";

/**
 * Единый формат ошибки слоя (docs/BACKEND.md §0, правило 4):
 * `{ error: { code, message_ru } }`. Extra fields (audio_path, transcript)
 * ride alongside the error object — the frontend contract of §9.
 */
export function apiError(
  status: number,
  code: string,
  message_ru: string,
  extra?: Record<string, unknown>,
): NextResponse {
  return NextResponse.json({ error: { code, message_ru }, ...extra }, { status });
}

export function apiOk(body: unknown, status = 200): NextResponse {
  return NextResponse.json(body, { status });
}
