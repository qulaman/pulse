/**
 * The moment a held tap must go out: the page goes, or its tab hides (a phone locks, the window is
 * swapped away). What waits out an undo window — a cancelled request, a request to the secretary
 * (D-139, D-158) — is sent then, not lost with the page.
 */
const installed = new WeakSet<() => void>();

/** Runs `flush` whenever the page leaves; once per function, a no-op on the server. */
export function flushOnLeave(flush: () => void) {
  if (typeof window === "undefined" || installed.has(flush)) return;
  installed.add(flush);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flush();
  });
  window.addEventListener("pagehide", flush);
}
