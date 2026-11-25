import { describe, expect, it } from "vitest";

import { inCompanyFolder, inOwnFolder } from "./folder";

const A = "aaaaaaaa-0000-4000-8000-000000000001";
const B = "bbbbbbbb-0000-4000-8000-000000000002";
const U = "10000000-0000-0000-0000-000000000009";
const F = "01513df9-670f-49a4-be31-ee60fcb0cb4d";

describe("inCompanyFolder", () => {
  it("takes the caller's own company folder", () => {
    expect(inCompanyFolder(`${A}/user/photo.jpg`, A)).toBe(true);
    expect(inCompanyFolder(`${A}/${U}/${F}.m4a`, A)).toBe(true);
    expect(inCompanyFolder(`${A}/${U}/${F}.webm`, A)).toBe(true);
  });

  it("refuses another company's folder, a look-alike prefix and a way out", () => {
    expect(inCompanyFolder(`${B}/user/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}x/user/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/../${B}/photo.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`photo.jpg`, A)).toBe(false);
  });

  it("refuses every path fetch could fold into another Storage endpoint", () => {
    // fetch turns /object/sign/voice/A/%2e%2e/… into /bucket/voice/empty — never let it start
    expect(inCompanyFolder(`${A}/%2e%2e/%2e%2e/%2e%2e/%2e%2e/bucket/voice/empty`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/%2E%2E/x/y.jpg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/../../../../bucket/voice/empty`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/../${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/./${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/.%2e/${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}%2f..%2f${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}\\..\\${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}//${U}/${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`/${A}/${U}/${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}.m4a?x=1`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}.m4a#x`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}.m4a\n`, A)).toBe(false);
  });

  it("refuses a missing, an extra or an unknown part", () => {
    expect(inCompanyFolder(`${A}/${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/x/${F}.m4a`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}.svg`, A)).toBe(false);
    expect(inCompanyFolder(`${A}/${U}/${F}.m4a.exe`, A)).toBe(false);
    expect(inCompanyFolder("", A)).toBe(false);
  });
});

describe("inOwnFolder", () => {
  it("takes only the caller's own folder of the company", () => {
    expect(inOwnFolder(`${A}/${U}/${F}.m4a`, A, U)).toBe(true);
    expect(inOwnFolder(`${A}/${F}/${F}.m4a`, A, U)).toBe(false);
    expect(inOwnFolder(`${B}/${U}/${F}.m4a`, A, U)).toBe(false);
    expect(inOwnFolder(`${A}/${U}/../${F}.m4a`, A, U)).toBe(false);
  });
});
