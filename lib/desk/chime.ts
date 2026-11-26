"use client";

import { useSyncExternalStore } from "react";

import { parseSound, SOUND_KEY } from "@/lib/desk/signals";
import { audioUnlocked, keepAudioAwake, subscribeAudio, unlockAudio, withAudio } from "@/lib/sound";

/**
 * The desk's calls (D-175): a soft chime for a new request and the ring of «Охрана» until it is
 * taken — two WebAudio voices, no file, on the app's one audio context (`lib/sound`, D-204). A
 * browser plays nothing before the person has touched the page: the desk listens for the first
 * click or key and wakes the audio there (DeskShell), and until then a call is skipped, not
 * queued. «Без звука» is kept per browser; it is about other people's news — the sounds of the
 * person's own actions have their own switch (`soundOn`).
 */

export { keepAudioAwake, unlockAudio };

/** Whether the browser lets this page make sound yet. */
export function useAudioUnlocked(): boolean {
  return useSyncExternalStore(subscribeAudio, audioUnlocked, () => false);
}

/** A call may come out this late when the audio had to wake; later it would be about nothing. */
const CALL_LATE_MS = 1_500;

function tone(ctx: AudioContext, frequency: number, at: number, length: number, peak: number): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = frequency;
  gain.gain.setValueAtTime(0.0001, at);
  gain.gain.exponentialRampToValueAtTime(peak, at + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(gain).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + length + 0.05);
}

/** A new request: two soft notes going up, quieter than the wall's door chime. */
export function playChime(): void {
  try {
    withAudio((ctx) => {
      const at = ctx.currentTime + 0.03;
      tone(ctx, 880, at, 0.55, 0.11);
      tone(ctx, 1318.5, at + 0.15, 0.85, 0.09);
    }, CALL_LATE_MS);
  } catch {
    // no sound is no reason to disturb the desk
  }
}

/** One ring of «Охрана»: two short trills like an old telephone; DeskShell repeats it until taken. */
export function playRing(): void {
  try {
    withAudio((ctx) => {
      const at = ctx.currentTime + 0.03;
      for (const burst of [0, 0.62]) {
        for (let i = 0; i < 9; i += 1) tone(ctx, i % 2 ? 1046.5 : 1318.5, at + burst + i * 0.052, 0.07, 0.15);
      }
    }, CALL_LATE_MS);
  } catch {
    // the alarm still covers the screen and fills the tab
  }
}

/** How often the ring comes back while «Охрана» waits. */
export const RING_EVERY_MS = 3_000;

// ---- «Без звука», per browser ----------------------------------------------------------------

const soundListeners = new Set<() => void>();
let memory: boolean | null = null;

function readSoundValue(): string | null {
  try {
    return window.localStorage.getItem(SOUND_KEY);
  } catch {
    return null;
  }
}

function subscribeSound(listener: () => void): () => void {
  soundListeners.add(listener);
  // another tab of the same browser switched it: this one follows
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SOUND_KEY) return;
    memory = null;
    listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    soundListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function writeDeskSound(on: boolean): void {
  memory = on;
  try {
    window.localStorage.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // a private window: the choice lives until the page goes
  }
  for (const listener of soundListeners) listener();
}

/**
 * Whether a reminder the person set himself may chime (D-177): unless this browser was told «Без
 * звука» — the director's default silence is about other people's news, not his own «напомни».
 */
export function reminderSoundOn(): boolean {
  if (typeof window === "undefined") return false;
  const value = memory === null ? readSoundValue() : memory ? "on" : "off";
  return value !== "off";
}

/** Whether this browser chimes and rings: on for the secretary, off for the director until chosen. */
export function useDeskSound(role: "director" | "secretary"): boolean {
  return useSyncExternalStore(
    subscribeSound,
    () => memory ?? parseSound(readSoundValue(), role),
    () => false,
  );
}
