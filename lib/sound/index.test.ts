import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BASE_GAIN,
  CUE_NAMES,
  CUES,
  GAINS,
  parsePicks,
  picked,
  pickOf,
  resetPicks,
  resetSoundForTest,
  setPick,
  setSoundGain,
  setSoundOn,
  sound,
  soundGain,
  soundOn,
  tapSound,
  VOICE_NAMES,
  VOICES,
  voiceMs,
} from "./index";

function stubStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
  });
  return store;
}

describe("sound — the voices (D-204)", () => {
  it("every moment names voices that exist, its own first, none twice", () => {
    for (const cue of CUE_NAMES) {
      const voices: readonly string[] = CUES[cue].voices;
      expect(voices.length).toBeGreaterThanOrEqual(2);
      expect(new Set(voices).size).toBe(voices.length);
      for (const voice of voices) expect(VOICE_NAMES).toContain(voice);
    }
  });

  it("a voice is short and never loud: under 0.8 s, every note under 0.1 of full scale", () => {
    for (const name of VOICE_NAMES) {
      const notes = VOICES[name];
      expect(notes.length).toBeGreaterThan(0);
      expect(voiceMs(notes), name).toBeLessThanOrEqual(800);
      for (const note of notes) {
        expect(note.ms, name).toBeGreaterThan(0);
        expect(note.hz, name).toBeGreaterThan(20);
        expect(note.gain ?? 0.05, name).toBeLessThanOrEqual(0.1);
      }
    }
  });

  it("«Запись началась» is over in a tenth of a second — before the microphone keeps anything", () => {
    for (const voice of CUES.recStart.voices) expect(voiceMs(VOICES[voice]), voice).toBeLessThanOrEqual(100);
  });

  it("the phone's moments are carried by a phone's speaker: their own voice has a note at 500 Hz or above", () => {
    for (const cue of CUE_NAMES) {
      if (CUES[cue].where === "desk") continue;
      const own = VOICES[CUES[cue].voices[0]] as readonly { hz: number; to?: number; noise?: string }[];
      const top = Math.max(...own.filter((note) => !note.noise).map((note) => Math.max(note.hz, note.to ?? 0)));
      // «нет» is the one low voice on purpose
      expect(top, cue).toBeGreaterThanOrEqual(cue === "refuse" ? 390 : 500);
    }
  });
});

describe("sound — the switch and the bench's choices, per device (D-204)", () => {
  beforeEach(() => {
    stubStorage();
    resetSoundForTest();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("is on until the device says «выключить»", () => {
    expect(soundOn()).toBe(true);
    setSoundOn(false);
    expect(soundOn()).toBe(false);
    setSoundOn(true);
    expect(soundOn()).toBe(true);
  });

  it("a moment plays its own voice until the bench picks another, and takes it back", () => {
    expect(pickOf("send")).toBe(CUES.send.voices[0]);
    expect(picked("send")).toBe(false);
    setPick("send", "landed");
    expect(pickOf("send")).toBe("landed");
    expect(picked("send")).toBe(true);
    setPick("done", "none");
    expect(pickOf("done")).toBe("none");
    setPick("send", null);
    expect(pickOf("send")).toBe(CUES.send.voices[0]);
    resetPicks();
    expect(pickOf("done")).toBe(CUES.done.voices[0]);
  });

  it("picking the moment's own voice stores nothing", () => {
    const store = stubStorage();
    resetSoundForTest();
    setPick("send", CUES.send.voices[0]);
    expect([...store.keys()]).toEqual([]);
  });

  it("drops what it cannot read: broken JSON, an unknown moment, an unknown voice", () => {
    expect(parsePicks("{")).toEqual({});
    expect(parsePicks("[1]")).toEqual({});
    expect(parsePicks(JSON.stringify({ send: "landed", nowhere: "paid", done: "trumpet", back: 3, check: "none" }))).toEqual({ send: "landed", check: "none" });
    // «constructor» is in every object: neither a moment nor a voice
    expect(parsePicks(JSON.stringify({ send: "constructor", toString: "paid" }))).toEqual({});
  });

  it("storage that refuses to keep a choice: it still holds until the tab closes", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
      removeItem: () => undefined,
    });
    resetSoundForTest();
    setSoundOn(false);
    expect(soundOn()).toBe(false);
    setPick("send", "landed");
    expect(pickOf("send")).toBe("landed");
  });

  it("loudness is one of the bench's steps, 1 until chosen", () => {
    expect(soundGain()).toBe(1);
    setSoundGain(GAINS[2]);
    expect(soundGain()).toBe(GAINS[2]);
    globalThis.localStorage.setItem("pulse.sound.gain.v1", "40");
    expect(soundGain()).toBe(1);
  });

  it("the loudest voice on the loudest step of a phone stays far from clipping", () => {
    // simultaneous notes add up: the sum of a voice's gains bounds its peak
    const sum = (name: (typeof VOICE_NAMES)[number]) => (VOICES[name] as readonly { gain?: number }[]).reduce((total, note) => total + (note.gain ?? 0.05), 0);
    const loudest = Math.max(...VOICE_NAMES.map(sum));
    expect(loudest * BASE_GAIN.phone * Math.max(...GAINS)).toBeLessThan(0.9);
  });

  it("without a browser a cue and a click are no-ops, never a crash", () => {
    expect(() => sound("send")).not.toThrow();
    expect(() => tapSound(Date.now())).not.toThrow();
  });
});
