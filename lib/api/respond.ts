import { NextResponse } from "next/server";

/**
 * The one error shape of the layer (docs/BACKEND.md §0, rule 4):
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

/** How a refusal of the SQL is answered: `[status, message_ru]`, plus the answer's code when it differs from the SQL's word. */
export type RpcRefusal = readonly [status: number, message_ru: string, code?: string];

export const NO_ACCESS: RpcRefusal = [403, "Нет доступа"];
export const NO_TASK: RpcRefusal = [404, "Задача не найдена"];
export const NO_PERSON: RpcRefusal = [404, "Такого сотрудника нет"];
export const STATUS_MOVED: RpcRefusal = [409, "Так нельзя: статус уже изменился"];
export const BAD_DEADLINE: RpcRefusal = [400, "Этот срок уже прошёл — выберите время впереди"];

/**
 * The answer to a refused RPC. The SQL raises a code word (`raise exception 'task_not_found'`);
 * the first word of `refusals` found in the message, in the map's order, is answered as the map
 * says. Any other failure throws «`rpc` failed: …», and withAuth answers it with a 500.
 */
export function rpcFailure(error: { message: string }, refusals: Record<string, RpcRefusal>, rpc: string): NextResponse {
  for (const [word, [status, message, code]] of Object.entries(refusals)) {
    if (error.message.includes(word)) return apiError(status, code ?? word, message);
  }
  throw new Error(`${rpc} failed: ${error.message}`);
}

/** The jsonb answer of a deduped RPC split for the client: `{ result, duplicate }`, a first call not being a duplicate. */
export function rpcResult(data: unknown): { result: Record<string, unknown>; duplicate: boolean } {
  const { duplicate = false, ...result } = (data ?? {}) as Record<string, unknown>;
  return { result, duplicate: duplicate as boolean };
}
