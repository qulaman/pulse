import { beforeEach, describe, expect, it, vi } from "vitest";

import { RecordingDroppedError, type Recorder } from "../voice/recorder";
import { useIngestStore } from "./ingest";

/**
 * The store's side of «the microphone can stay open» (2026-11-26): stop and cancel that come while
 * the browser is still opening the microphone never leave it to open with no owner.
 */

type FakeRecorder = Recorder & { grant: () => void; deny: (cause: unknown) => void; cancel: ReturnType<typeof vi.fn>; stop: ReturnType<typeof vi.fn> };

const made = vi.hoisted(() => ({ recorders: [] as unknown[] }));

/** A recorder whose microphone the test opens by hand; cancel() drops an opening one, like the real one. */
function fakeRecorder(): FakeRecorder {
  let opening = true;
  let resolve: () => void = () => {};
  let reject: (cause: unknown) => void = () => {};
  const started = new Promise<void>((ok, fail) => {
    resolve = ok;
    reject = fail;
  });
  let dropped = false;
  const fake = {
    start: vi.fn(() => started),
    stop: vi.fn(() => Promise.reject(new Error("not in this test"))),
    cancel: vi.fn(() => {
      if (opening) dropped = true;
    }),
    onLevel: () => () => {},
    grant: () => {
      opening = false;
      if (dropped) reject(new RecordingDroppedError());
      else resolve();
    },
    deny: (cause: unknown) => {
      opening = false;
      reject(cause);
    },
  };
  return fake as unknown as FakeRecorder;
}

vi.mock("../voice/recorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../voice/recorder")>();
  return {
    ...actual,
    createRecorder: () => {
      const recorder = fakeRecorder();
      made.recorders.push(recorder);
      return recorder;
    },
  };
});

const last = () => made.recorders[made.recorders.length - 1] as FakeRecorder;

beforeEach(() => {
  made.recorders.length = 0;
  useIngestStore.getState().reset();
});

describe("ingest store — a start still opening the microphone", () => {
  it("cancel: the opening microphone is dropped, and its late answer changes nothing", async () => {
    const starting = useIngestStore.getState().startVoice();
    useIngestStore.getState().cancelVoice();
    expect(last().cancel).toHaveBeenCalledTimes(1);

    last().grant();
    await starting;
    expect(useIngestStore.getState().stage).toBe("idle");
    expect(useIngestStore.getState().error).toBeNull();
  });

  it("stop: «too short» at once, the recorder dropped, nothing stopped that never started", async () => {
    const starting = useIngestStore.getState().startVoice();
    await useIngestStore.getState().stopVoice();

    expect(useIngestStore.getState().stage).toBe("error");
    expect(useIngestStore.getState().error?.code).toBe("record_too_short");
    expect(last().cancel).toHaveBeenCalledTimes(1);
    expect(last().stop).not.toHaveBeenCalled();

    last().grant();
    await starting;
    expect(useIngestStore.getState().error?.code).toBe("record_too_short");
  });

  it("a refusal that comes after cancel says nothing: the person had already let go", async () => {
    const starting = useIngestStore.getState().startVoice();
    useIngestStore.getState().cancelVoice();
    last().deny(new DOMException("denied", "NotAllowedError"));
    await starting;

    expect(useIngestStore.getState().stage).toBe("idle");
    expect(useIngestStore.getState().error).toBeNull();
  });

  it("a refusal with the finger still down is «нет доступа к микрофону»", async () => {
    const starting = useIngestStore.getState().startVoice();
    last().deny(new DOMException("denied", "NotAllowedError"));
    await starting;

    expect(useIngestStore.getState().error?.code).toBe("mic_denied");
  });

  it("a new hold after a quick cancel is its own recording: the old opening cannot touch it", async () => {
    const first = useIngestStore.getState().startVoice();
    useIngestStore.getState().cancelVoice();
    const old = last();
    const second = useIngestStore.getState().startVoice();
    const fresh = last();

    old.grant();
    await first;
    fresh.grant();
    await second;

    expect(fresh).not.toBe(old);
    expect(useIngestStore.getState().stage).toBe("recording");
    expect(useIngestStore.getState().error).toBeNull();
  });
});
