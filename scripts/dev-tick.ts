/**
 * The minute tick for a local `next dev` (D-114): on Vercel the platform cron calls
 * /api/push/sweep every minute; on a developer's machine nobody does, so held tasks, event and
 * note reminders, the secretary's repeats, the director's digests and signals, and the outbox
 * cleanup never ran while testing. This loop is that cron: GET with the same Bearer secret.
 *   pnpm dev:tick               (against http://localhost:3000, APP_URL to override)
 *   EVERY=60                    seconds between ticks
 */
process.loadEnvFile(".env.local");

const APP_URL = process.env.APP_URL ?? "http://localhost:3000";
const EVERY_MS = Math.max(10, Number(process.env.EVERY ?? 60)) * 1000;
const SECRET = process.env.CRON_SECRET;

if (!SECRET) {
  console.error("CRON_SECRET is not set in .env.local — the sweep answers 401 without it");
  process.exit(2);
}
if (!/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.)/.test(APP_URL) && process.env.FORCE !== "1") {
  // a deployed instance has its own cron: two tickers are harmless (rows are claimed), but pointless
  console.error(`${APP_URL} is not a local server; the platform cron ticks it (FORCE=1 to run anyway)`);
  process.exit(2);
}

async function tick() {
  const at = new Date().toLocaleTimeString("ru-RU");
  try {
    const res = await fetch(`${APP_URL}/api/push/sweep`, { headers: { authorization: `Bearer ${SECRET}` } });
    const body = (await res.json().catch(() => null)) as Record<string, number> | null;
    if (!res.ok || !body) {
      console.log(`${at} sweep ${res.status}`);
      return;
    }
    // only what happened, not a wall of zeros
    const done = Object.entries(body).filter(([, n]) => typeof n === "number" && n > 0);
    console.log(`${at} ${done.length ? done.map(([k, n]) => `${k} ${n}`).join(" · ") : "—"}`);
  } catch (err) {
    console.log(`${at} no server at ${APP_URL} (${err instanceof Error ? err.message : err})`);
  }
}

console.log(`ticking ${APP_URL}/api/push/sweep every ${EVERY_MS / 1000} s — Ctrl+C to stop`);
void tick();
setInterval(() => void tick(), EVERY_MS);
