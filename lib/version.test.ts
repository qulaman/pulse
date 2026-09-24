import { describe, expect, it } from "vitest";

import {
  COMPAT,
  looksLikeStaleBuild,
  updateAction,
  updateOutcome,
  versionLabel,
  versionStatus,
  type BuildInfo,
  type UpdateContext,
} from "./version";

const mine: BuildInfo = { id: "dpl_A", sha: "4c1bbfa", at: "2026-09-24T09:05:00Z", compat: COMPAT };

describe("versionStatus", () => {
  it("is unknown before the first answer", () => {
    expect(versionStatus(mine, null)).toBe("unknown");
    expect(versionStatus(mine, undefined)).toBe("unknown");
  });

  it("is current when the server runs the same build", () => {
    expect(versionStatus(mine, { ...mine })).toBe("current");
  });

  it("is outdated when the server runs another build of the same compat", () => {
    expect(versionStatus(mine, { ...mine, id: "dpl_B", sha: "9d158df" })).toBe("outdated");
  });

  it("follows the server back on a rollback too", () => {
    expect(versionStatus(mine, { ...mine, id: "dpl_OLD", at: "2026-09-20T09:00:00Z" })).toBe("outdated");
  });

  it("is required when compat differs either way", () => {
    expect(versionStatus(mine, { ...mine, id: "dpl_B", compat: COMPAT + 1 })).toBe("required");
    expect(versionStatus(mine, { ...mine, id: "dpl_B", compat: COMPAT - 1 })).toBe("required");
  });
});

describe("versionLabel", () => {
  it("names the version by its Aqtobe date and time", () => {
    // 09:05 UTC = 14:05 in Aqtobe (UTC+5)
    expect(versionLabel(mine)).toBe("от 24 сент., 14:05");
  });

  it("crosses midnight in Aqtobe, not in UTC", () => {
    expect(versionLabel({ at: "2026-09-24T19:30:00Z", sha: "x" })).toBe("от 25 сент., 00:30");
  });

  it("falls back to the commit, then to a plain word", () => {
    expect(versionLabel({ at: null, sha: "4c1bbfa" })).toBe("4c1bbfa");
    expect(versionLabel({ at: "garbage", sha: "4c1bbfa" })).toBe("4c1bbfa");
    expect(versionLabel({ at: null, sha: "" })).toBe("локальная");
  });
});

describe("updateAction", () => {
  const base: UpdateContext = {
    status: "outdated",
    busy: false,
    typing: false,
    kiosk: false,
    requested: false,
    freshResume: false,
    recentlyFailed: false,
  };

  it("stays silent when current or unknown", () => {
    expect(updateAction({ ...base, status: "current" })).toBe("none");
    expect(updateAction({ ...base, status: "unknown", requested: true, freshResume: true })).toBe("none");
  });

  it("offers the update while the person works", () => {
    expect(updateAction(base)).toBe("offer");
  });

  it("applies at once when asked and nothing is unsaved", () => {
    expect(updateAction({ ...base, requested: true })).toBe("apply");
  });

  it("waits for a draft or a recording when asked", () => {
    expect(updateAction({ ...base, requested: true, busy: true })).toBe("wait");
  });

  it("updates quietly on a return after a long time away", () => {
    expect(updateAction({ ...base, freshResume: true })).toBe("apply");
  });

  it("never updates quietly over unsaved work or a field in focus", () => {
    expect(updateAction({ ...base, freshResume: true, busy: true })).toBe("offer");
    expect(updateAction({ ...base, freshResume: true, typing: true })).toBe("offer");
  });

  it("a tap is not stopped by a focused field, only by unsaved work", () => {
    expect(updateAction({ ...base, requested: true, typing: true })).toBe("apply");
  });

  it("does not loop after a reload that brought the same build", () => {
    expect(updateAction({ ...base, freshResume: true, recentlyFailed: true })).toBe("offer");
    // a tap is still honoured
    expect(updateAction({ ...base, requested: true, recentlyFailed: true })).toBe("apply");
  });

  it("puts up the screen for a required update once nothing is unsaved", () => {
    expect(updateAction({ ...base, status: "required" })).toBe("screen");
    expect(updateAction({ ...base, status: "required", busy: true })).toBe("offer");
    expect(updateAction({ ...base, status: "required", requested: true })).toBe("apply");
  });

  it("lets the TV wall update itself, without taps", () => {
    expect(updateAction({ ...base, kiosk: true })).toBe("apply");
    expect(updateAction({ ...base, kiosk: true, status: "required" })).toBe("apply");
    expect(updateAction({ ...base, kiosk: true, recentlyFailed: true })).toBe("none");
  });
});

describe("looksLikeStaleBuild", () => {
  it("knows the errors of a build the server no longer serves", () => {
    expect(looksLikeStaleBuild("ChunkLoadError: Loading chunk 812 failed.")).toBe(true);
    expect(looksLikeStaleBuild("Loading CSS chunk app-layout failed")).toBe(true);
    expect(looksLikeStaleBuild("TypeError: Failed to fetch dynamically imported module: /_next/x.js")).toBe(true);
    expect(looksLikeStaleBuild("Importing a module script failed.")).toBe(true);
    expect(
      looksLikeStaleBuild("Error: Failed to find Server Action. This request might be from an older or newer deployment."),
    ).toBe(true);
    // what the browser itself throws in Next 16 (server-action-reducer)
    expect(
      looksLikeStaleBuild(
        'UnrecognizedActionError: Server Action "7f3a9c" was not found on the server. \nRead more: https://nextjs.org/docs/messages/failed-to-find-server-action',
      ),
    ).toBe(true);
  });

  it("leaves ordinary failures alone", () => {
    expect(looksLikeStaleBuild("TypeError: Failed to fetch")).toBe(false);
    expect(looksLikeStaleBuild("Нет связи")).toBe(false);
  });
});

describe("updateOutcome", () => {
  const now = Date.parse("2026-09-24T10:00:00Z");

  it("says nothing without a fresh mark", () => {
    expect(updateOutcome(null, mine, now)).toBeNull();
    expect(updateOutcome({ from: "dpl_OLD", at: now - 6 * 60_000 }, mine, now)).toBeNull();
    expect(updateOutcome({ from: "dpl_OLD", at: now + 60_000 }, mine, now)).toBeNull();
  });

  it("confirms a new build after the reload", () => {
    expect(updateOutcome({ from: "dpl_OLD", at: now - 2_000 }, mine, now)).toBe("updated");
  });

  it("notices a reload that brought back the same build", () => {
    expect(updateOutcome({ from: "dpl_A", at: now - 2_000 }, mine, now)).toBe("same");
  });
});
