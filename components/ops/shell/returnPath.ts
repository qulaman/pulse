const KEY = "ops-return";

/** Where the operator stood when the session ended, kept in this tab only. */
export function keepReturnPath(path: string | null) {
  try {
    if (path) sessionStorage.setItem(KEY, path);
    else sessionStorage.removeItem(KEY);
  } catch {
    // storage may be closed: the console's home is a fine place to come back to
  }
}

/** Taken once, after the sign-in: only a page of the console, and never the sign-in itself. */
export function takeReturnPath(fallback: string): string {
  try {
    const path = sessionStorage.getItem(KEY);
    sessionStorage.removeItem(KEY);
    if (path && (path === "/ops" || path.startsWith("/ops/") || path.startsWith("/ops?")) && !path.startsWith("/ops/login")) return path;
  } catch {
    // the same: storage may be closed
  }
  return fallback;
}
