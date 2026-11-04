import { OpsError } from "@/lib/ops/client";

/**
 * The sign-in's own POST: here a 401 is an answer («неверный пароль»), not a dead session, so
 * `opsFetch`'s trip back to the sign-in screen would only wipe the words off it.
 */
export async function authPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => null)) as { error?: { code?: string; message_ru?: string } } | null;
  if (response.ok) return data as T;
  throw new OpsError(response.status, data?.error?.code ?? "internal", data?.error?.message_ru ?? "Что-то пошло не так, попробуй ещё раз");
}
