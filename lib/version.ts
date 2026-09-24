/**
 * Which version of the app this phone runs, and what to do when the server runs another
 * (D-115). A PWA lives for days in the phone's memory: after a deploy the code on the
 * screen is older than the server it talks to. The phone asks `/api/version` whenever it
 * is online and awake, compares, and either says so with one button or — when nobody is
 * working in it — quietly reloads on the way back from the background.
 *
 * Everything here is pure: the same module answers on the server (`/api/version`) and in
 * the browser, with the values next.config.ts inlined into both halves of one build.
 */

/**
 * Raise by one when a change makes the previous build unable to work with this server:
 * an API route changed its body, an RPC changed its arguments, a table the client reads
 * changed its shape. A phone on another number gets the «обновите» screen, not a line.
 * An additive change (new route, new column) leaves it alone.
 */
export const COMPAT = 1;

export type BuildInfo = {
  /** Compared by machines: the Vercel deployment, a CI run id outside Vercel, or `git-<commit>`. */
  id: string;
  /** Short commit, for support: «версия от 24 сент., 14:05 · 4c1bbfa». */
  sha: string;
  /** Commit time (ISO) — the human name of the version. */
  at: string | null;
  compat: number;
};

export const BUILD: BuildInfo = {
  id: process.env.PULSE_BUILD_ID || "dev",
  sha: process.env.PULSE_BUILD_SHA || "",
  at: process.env.PULSE_BUILD_AT || null,
  compat: COMPAT,
};

export type VersionStatus = "current" | "outdated" | "required" | "unknown";

/** `unknown` — not checked yet or no network: say nothing rather than guess. */
export function versionStatus(mine: BuildInfo, server: BuildInfo | null | undefined): VersionStatus {
  if (!server) return "unknown";
  // either way round: a rolled-back server cannot serve a newer client's calls either
  if (server.compat !== mine.compat) return "required";
  return server.id === mine.id ? "current" : "outdated";
}

const LABEL_FORMAT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Aqtobe",
});

/**
 * «от 24 сент., 14:05» — a date a person recognises; the commit only when there is no date.
 * Reads after «версия»: «Версия от 24 сент., 14:05», «Обновил до версии 4c1bbfa».
 */
export function versionLabel(info: Pick<BuildInfo, "at" | "sha">): string {
  const at = info.at ? new Date(info.at) : null;
  if (at && !Number.isNaN(at.getTime())) {
    const part = (type: Intl.DateTimeFormatPartTypes) =>
      LABEL_FORMAT.formatToParts(at).find((p) => p.type === type)?.value ?? "";
    return `от ${part("day")} ${part("month")}, ${part("hour")}:${part("minute")}`;
  }
  return info.sha || "локальная";
}

/** Back from this long in the background, a reload surprises nobody: the session is over. */
export const LONG_HIDE_MS = 30 * 60_000;
/** A reload that brought back the same build is not retried by itself for this long. */
export const RETRY_AFTER_FAIL_MS = 10 * 60_000;

/**
 * - `none` — nothing to show;
 * - `offer` — the line «Есть новая версия · Обновить»;
 * - `wait` — asked for, but something unsaved is on the screen: «Обновлю, как закончите»;
 * - `screen` — this build can no longer work with the server: a screen with one button;
 * - `apply` — reload now.
 */
export type UpdateAction = "none" | "offer" | "wait" | "screen" | "apply";

export type UpdateContext = {
  status: VersionStatus;
  /** A recording, a draft, a request in flight — a reload would lose it. */
  busy: boolean;
  /** A field has the focus: the person may be mid-word. Stops only the quiet update. */
  typing: boolean;
  /** The TV wall: nobody there to tap (principle 10). */
  kiosk: boolean;
  /** The person tapped «Обновить» and the update has not happened yet. */
  requested: boolean;
  /** This is the one decision taken on the return from a long stay in the background. */
  freshResume: boolean;
  /** A reload a moment ago brought back the same build. */
  recentlyFailed: boolean;
};

export function updateAction(c: UpdateContext): UpdateAction {
  if (c.status === "current" || c.status === "unknown") return "none";
  if (c.kiosk) return c.recentlyFailed ? "none" : "apply";
  if (c.busy) return c.requested ? "wait" : "offer";
  if (c.requested) return "apply";
  if (c.status === "required") return "screen";
  return c.freshResume && !c.typing && !c.recentlyFailed ? "apply" : "offer";
}

/**
 * The errors an old build meets after a deploy: a lazy chunk of the previous build is gone
 * (404), a server action id changed (Next renames them every build). The chunk errors also
 * come from a dead network, so they only prompt a check — `/api/version` decides.
 */
export function looksLikeStaleBuild(message: string): boolean {
  return /ChunkLoadError|Loading (?:CSS )?chunk \S+ failed|Failed to fetch dynamically imported module|Importing a module script failed|Failed to find Server Action|UnrecognizedActionError|Server Action "[^"]*" was not found on the server/i.test(
    message,
  );
}

/** Left in sessionStorage right before a reload, read by the page that comes up after it. */
export type UpdateMark = { from: string; at: number };

/** `updated` — the reload brought a new build; `same` — it did not (a cache, a lagging CDN). */
export function updateOutcome(mark: UpdateMark | null, mine: BuildInfo, now: number): "updated" | "same" | null {
  if (!mark || now - mark.at > 5 * 60_000 || now < mark.at) return null;
  return mark.from === mine.id ? "same" : "updated";
}
