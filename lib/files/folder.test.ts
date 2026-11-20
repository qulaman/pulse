import { describe, expect, it } from "vitest";

import { inCompanyFolder } from "./folder";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";

describe("inCompanyFolder", () => {
  it("takes the caller's own company folder", () => {
    expect(inCompanyFolder(`${A}/user/photo.jpg`, A)).toBe(true);
  });

  it("refuses another company's folder, a look-alike prefix and a way out", () => {
    expect(inCompanyFolder(`${B}/user/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}x/user/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/../${B}/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`photo.jpg`, A)).toBe(false);
  });
});
