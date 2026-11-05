import { describe, expect, it } from "vitest";

import { avatarPath, avatarPathFits, avatarPathOf, squareCrop } from "./avatar";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";
const KEY = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const HOST = "https://abc.supabase.co/storage/v1/object/public/avatars";

describe("avatarPathFits", () => {
  it("takes the company's own file in the shape the client uploads", () => {
    expect(avatarPathFits(avatarPath(COMPANY, KEY), COMPANY)).toBe(true);
  });

  it("refuses another company, another shape, a way out of the folder", () => {
    expect(avatarPathFits(avatarPath(OTHER, KEY), COMPANY)).toBe(false);
    expect(avatarPathFits(`${COMPANY}/${KEY}.png`, COMPANY)).toBe(false);
    expect(avatarPathFits(`${COMPANY}/x/${KEY}.jpg`, COMPANY)).toBe(false);
    expect(avatarPathFits(`${COMPANY}/../${OTHER}/${KEY}.jpg`, COMPANY)).toBe(false);
    expect(avatarPathFits(`${KEY}.jpg`, COMPANY)).toBe(false);
    expect(avatarPathFits("", COMPANY)).toBe(false);
  });
});

describe("avatarPathOf", () => {
  it("finds the file behind a stored URL", () => {
    expect(avatarPathOf(`${HOST}/${COMPANY}/${KEY}.jpg`, COMPANY)).toBe(`${COMPANY}/${KEY}.jpg`);
  });

  it("never names a file of another company", () => {
    expect(avatarPathOf(`${HOST}/${OTHER}/${KEY}.jpg`, COMPANY)).toBeNull();
  });

  it("leaves alone what is not a stored photo", () => {
    expect(avatarPathOf(null, COMPANY)).toBeNull();
    expect(avatarPathOf("", COMPANY)).toBeNull();
    expect(avatarPathOf("not a url", COMPANY)).toBeNull();
    expect(avatarPathOf(`https://example.com/${COMPANY}/${KEY}.jpg`, COMPANY)).toBeNull();
    expect(avatarPathOf(`https://abc.supabase.co/storage/v1/object/public/brand/${COMPANY}/${KEY}.jpg`, COMPANY)).toBeNull();
  });
});

describe("squareCrop", () => {
  it("takes a wide picture from the middle", () => {
    expect(squareCrop(1600, 900)).toEqual({ sx: 350, sy: 0, side: 900 });
  });

  it("takes a tall one nearer the top, where the face is", () => {
    expect(squareCrop(900, 1600)).toEqual({ sx: 0, sy: 210, side: 900 });
  });

  it("leaves a square whole", () => {
    expect(squareCrop(512, 512)).toEqual({ sx: 0, sy: 0, side: 512 });
  });
});
