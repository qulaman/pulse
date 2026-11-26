import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createRecorder, isSilent, RecordingDroppedError, SILENT_PEAK } from "./recorder";

/** A microphone the test answers by hand: the browser's permission prompt still up until `grant()`. */
function fakeMicrophone() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  let grant: () => void = () => {};
  let deny: (cause: unknown) => void = () => {};
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve, reject) => {
        grant = () => resolve(stream);
        deny = reject;
      }),
  );
  return { track, getUserMedia, grant: () => grant(), deny: (cause: unknown) => deny(cause) };
}

describe("createRecorder — released before the microphone opened (2026-11-26)", () => {
  let mic: ReturnType<typeof fakeMicrophone>;
  let MediaRecorderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mic = fakeMicrophone();
    vi.stubGlobal("navigator", { mediaDevices: { getUserMedia: mic.getUserMedia } });
    // no Web Audio in the test: the meter stays off, the recording itself does not care
    vi.stubGlobal("window", {});
    MediaRecorderMock = vi.fn(function (this: Record<string, unknown>) {
      this.state = "inactive";
      this.mimeType = "audio/webm";
      this.start = vi.fn(() => {
        this.state = "recording";
      });
      this.stop = vi.fn(() => {
        this.state = "inactive";
      });
    });
    Object.assign(MediaRecorderMock, { isTypeSupported: () => true });
    vi.stubGlobal("MediaRecorder", MediaRecorderMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("cancel() before the stream comes: the stream is closed on arrival, nothing records", async () => {
    const recorder = createRecorder();
    const started = recorder.start();
    recorder.cancel();
    mic.grant();

    await expect(started).rejects.toBeInstanceOf(RecordingDroppedError);
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
    expect(MediaRecorderMock).not.toHaveBeenCalled();
  });

  it("stop() before the stream comes: refused at once, the late stream is closed on arrival", async () => {
    const recorder = createRecorder();
    const started = recorder.start();
    await expect(recorder.stop()).rejects.toThrow();
    mic.grant();

    await expect(started).rejects.toBeInstanceOf(RecordingDroppedError);
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
    expect(MediaRecorderMock).not.toHaveBeenCalled();
  });

  it("a refusal after cancel() is the browser's own error, and nothing is left open", async () => {
    const recorder = createRecorder();
    const started = recorder.start();
    recorder.cancel();
    mic.deny(new DOMException("denied", "NotAllowedError"));

    await expect(started).rejects.toMatchObject({ name: "NotAllowedError" });
    expect(MediaRecorderMock).not.toHaveBeenCalled();
  });

  it("an untouched start records, and cancel() then closes the microphone", async () => {
    const recorder = createRecorder();
    const started = recorder.start();
    mic.grant();
    await started;

    expect(MediaRecorderMock).toHaveBeenCalledTimes(1);
    const media = MediaRecorderMock.mock.instances[0] as { start: ReturnType<typeof vi.fn> };
    expect(media.start).toHaveBeenCalledTimes(1);
    expect(mic.track.stop).not.toHaveBeenCalled();

    recorder.cancel();
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
  });

  it("a cancel() of an earlier recording does not drop the next start", async () => {
    const recorder = createRecorder();
    recorder.cancel();
    const started = recorder.start();
    mic.grant();
    await started;

    expect(MediaRecorderMock).toHaveBeenCalledTimes(1);
    expect(mic.track.stop).not.toHaveBeenCalled();
  });

  it("a MediaRecorder that cannot start closes the stream it was given", async () => {
    MediaRecorderMock.mockImplementation(function () {
      throw new Error("NotSupportedError");
    });
    const recorder = createRecorder();
    const started = recorder.start();
    mic.grant();

    await expect(started).rejects.toThrow("NotSupportedError");
    expect(mic.track.stop).toHaveBeenCalledTimes(1);
  });
});

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
