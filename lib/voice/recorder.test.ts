import { describe, expect, it } from "vitest";

import { isSilent, SILENT_PEAK } from "./recorder";

describe("isSilent — a dead microphone, measured in the browser", () => {
  it("a recording whose loudest sample stayed under −54 dBFS is silence", () => {
    expect(isSilent({ peak: 0 })).toBe(true);
    expect(isSilent({ peak: SILENT_PEAK / 2 })).toBe(true);
  });

  it("speech and a quiet room's own noise are not", () => {
    expect(isSilent({ peak: 0.4 })).toBe(false);
    expect(isSilent({ peak: SILENT_PEAK * 2 })).toBe(false);
  });

  it("not measured (no Web Audio, a suspended clock, a background tab) is never silence", () => {
    expect(isSilent({})).toBe(false);
    expect(isSilent({ peak: undefined })).toBe(false);
  });
});
