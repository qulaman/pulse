/**
 * «No network» is not a failure to show, it is a queue to keep (DoD «Оффлайн»): a mutation
 * that hit this error pauses and resumes when the phone is back online, exactly once —
 * the idempotency key is minted at the tap, not per attempt (принцип 7).
 */
export class NetworkError extends Error {
  constructor(message = "Нет связи") {
    super(message);
    this.name = "NetworkError";
  }
}

/** Fetch and supabase-js both surface a dead network as a TypeError-ish «Failed to fetch». */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof NetworkError) return true;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(message);
}
