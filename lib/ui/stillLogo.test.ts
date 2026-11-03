import { afterEach, describe, expect, it, vi } from "vitest";

import { frameSize, isVectorLogo, RASTER_MAX_SIDE, stillFrame, VECTOR_SIDE } from "./stillLogo";

const BUCKET = "https://ref.supabase.co/storage/v1/object/public/brand/11111111-1111-1111-1111-111111111111";

describe("isVectorLogo", () => {
  it("an .svg path is a vector, whatever the case or the query", () => {
    expect(isVectorLogo(`${BUCKET}/logo-mtwk0cc7.svg`)).toBe(true);
    expect(isVectorLogo(`${BUCKET}/logo.SVG?v=2#x`)).toBe(true);
    expect(isVectorLogo("/brand/logo.svg")).toBe(true);
  });

  it("rasters and addresses without a type are not", () => {
    expect(isVectorLogo(`${BUCKET}/logo-1.png`)).toBe(false);
    expect(isVectorLogo(`${BUCKET}/logo-1.webp`)).toBe(false);
    expect(isVectorLogo(`${BUCKET}/logo-1.jpg?name=a.svg`)).toBe(false);
    expect(isVectorLogo("blob:http://localhost:3000/5d1c0f2e-0000-4000-8000-000000000000")).toBe(false);
  });
});

describe("frameSize", () => {
  it("a raster keeps its own size", () => {
    expect(frameSize(240, 80, false)).toEqual({ width: 240, height: 80 });
  });

  it("a big raster shrinks to 1024 on the long side, proportions kept", () => {
    expect(frameSize(4000, 1000, false)).toEqual({ width: RASTER_MAX_SIDE, height: 256 });
    expect(frameSize(500, 2048, false)).toEqual({ width: 250, height: RASTER_MAX_SIDE });
  });

  it("a vector is drawn at 512 on the long side — up or down", () => {
    // the dev logo: viewBox only, Chrome reports 300×103
    expect(frameSize(300, 103, true)).toEqual({ width: VECTOR_SIDE, height: 176 });
    expect(frameSize(2000, 1000, true)).toEqual({ width: VECTOR_SIDE, height: 256 });
    expect(frameSize(64, 128, true)).toEqual({ width: 256, height: VECTOR_SIDE });
  });

  it("no size — no frame", () => {
    expect(frameSize(0, 0, true)).toBeNull();
    expect(frameSize(0, 100, false)).toBeNull();
    expect(frameSize(Number.NaN, 100, false)).toBeNull();
  });

  it("a thin line never collapses to zero", () => {
    expect(frameSize(5000, 1, false)).toEqual({ width: RASTER_MAX_SIDE, height: 1 });
  });
});

describe("stillFrame", () => {
  afterEach(() => vi.restoreAllMocks());

  it("makes the frame once: a second show paints from the cache", async () => {
    const snapshot = vi.fn(async (src: string) => `blob:frame-of-${src}`);
    const src = `${BUCKET}/cache.svg`;
    await expect(stillFrame(src, snapshot)).resolves.toBe(`blob:frame-of-${src}`);
    await expect(stillFrame(src, snapshot)).resolves.toBe(`blob:frame-of-${src}`);
    expect(snapshot).toHaveBeenCalledTimes(1);
  });

  it("no CORS: toBlob's SecurityError leaves the file as is, warned once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const snapshot = vi.fn(async () => {
      throw new DOMException("Tainted canvases may not be exported.", "SecurityError");
    });
    const src = `${BUCKET}/no-cors.png`;
    await expect(stillFrame(src, snapshot)).resolves.toBeNull();
    await expect(stillFrame(src, snapshot)).resolves.toBeNull();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain("SecurityError");
  });

  it("a snapshot that throws before its promise still ends as null, not a crash", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const snapshot = (() => {
      throw new Error("no 2d context");
    }) as unknown as (src: string) => Promise<string>;
    await expect(stillFrame(`${BUCKET}/sync-throw.png`, snapshot)).resolves.toBeNull();
  });
});
