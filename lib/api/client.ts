"use client";

import { NetworkError } from "@/lib/net";
import { dequeue, enqueue, release } from "@/lib/outbox";

/** What a failed call shows when the server said nothing a person can read. */
export const GENERIC_ERROR = "Не получилось. Попробую ещё раз по тапу";

export type ApiErrorBody = { error?: { code?: string; message_ru?: string } };

const SESSION_GONE = "Сессия истекла. Войди заново";

/** A refusal of a route: its message is what the person reads, the rest is for the caller to branch on. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** The route's `error.code`, null when it gave none. */
    readonly code: string | null,
    message: string,
    /** The whole answer — some routes ride extra fields beside `error` (docs/BACKEND.md §0). */
    readonly body: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export type PostOptions = {
  /**
   * Keep the call in the persisted outbox when the network is dead (default). Off for a call about
   * «now» that must not land later — a visitor at the desk, a voice phrase with its own keeping.
   */
  outbox?: boolean;
  /** The outbox key when the payload carries no `client_request_id`. */
  key?: string;
  /** The words of a dead network (thrown as NetworkError). */
  offline?: string;
  /** The words of a refusal the server gave none for. */
  fallback?: string;
};

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * POST a JSON body to a route of ours. The answer's JSON body on success (null when there is none);
 * a dead network throws NetworkError (and waits in the outbox), a refusal throws ApiError, and a
 * dead session goes to /login — the one 401 rule of the client.
 */
export async function postJson(path: string, payload: unknown, options: PostOptions = {}): Promise<unknown> {
  const { outbox = true } = options;
  // the idempotency key doubles as the outbox key: a replay after a reload is the same call
  const key =
    options.key ?? (payload as { client_request_id?: string } | null)?.client_request_id ?? `${path}:${Date.now()}`;
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    if (outbox) {
      // the mutation pauses and resumes when the network is back (QueryProvider, networkMode
      // offlineFirst); the persisted copy survives a closed tab and replays on the next start.
      // A tap fresh out of its «Отменить» window waited there unseen; now it really waits (D-139)
      enqueue({ id: key, path, payload });
      release(key);
    }
    throw new NetworkError(options.offline ?? "Нет связи. Отправлю, как появится");
  }
  if (outbox) dequeue(key);

  const body = await readJson(res);
  if (res.ok) return body;
  const error = (body as ApiErrorBody | null)?.error;
  if (res.status === 401 && typeof window !== "undefined") {
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- full reload on purpose: drop every client cache of the dead session
    window.location.assign(`${window.location.origin}/login`);
    throw new ApiError(401, error?.code ?? "unauthorized", SESSION_GONE, body);
  }
  throw new ApiError(res.status, error?.code ?? null, error?.message_ru ?? options.fallback ?? GENERIC_ERROR, body);
}
