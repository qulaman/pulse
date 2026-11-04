import { OPS_LOGIN_PATH } from "./paths";

/**
 * The console's fetch (D-157): one retry after a fresh TOTP, a dead session goes to the console's
 * own sign-in. No offline queue and no automatic retry — an operator's write happens once, on
 * the operator's click.
 */
export class OpsError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "OpsError";
    this.status = status;
    this.code = code;
  }
}

type FreshPrompt = () => Promise<boolean>;

let freshPrompt: FreshPrompt | null = null;

/** The console's frame registers its TOTP dialog here; `false` means the operator cancelled. */
export function registerFreshPrompt(prompt: FreshPrompt | null): void {
  freshPrompt = prompt;
}

export function newRequestId(): string {
  return globalThis.crypto.randomUUID();
}

async function send(path: string, method: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method,
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

async function read<T>(response: Response): Promise<T> {
  const data = (await response.json().catch(() => null)) as { error?: { code?: string; message_ru?: string } } | null;
  if (response.ok) return data as T;
  throw new OpsError(
    response.status,
    data?.error?.code ?? "internal",
    data?.error?.message_ru ?? "Что-то пошло не так, попробуй ещё раз",
  );
}

export async function opsFetch<T>(path: string, init?: { method?: "GET" | "POST" | "PATCH"; body?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.body === undefined ? "GET" : "POST");
  let response = await send(path, method, init?.body);

  if (response.status === 428 && freshPrompt) {
    if (!(await freshPrompt())) throw new OpsError(428, "fresh_required", "Нужен код из приложения");
    // the same body, so the same client_request_id: still one action
    response = await send(path, method, init?.body);
  }
  if (response.status === 401 && typeof window !== "undefined") {
    window.location.assign(OPS_LOGIN_PATH);
  }
  return read<T>(response);
}
