"use client";

import { useSyncExternalStore } from "react";

import { parseSound, SOUND_KEY } from "@/lib/desk/signals";

/**
 * The desk's sound (D-175): a soft chime for a new request and the ring of «Охрана» until it is
 * taken — two WebAudio voices, no file. A browser plays nothing before the person has touched
 * the page: the desk listens for the first click or key and wakes the audio there
 * (DeskShell), and until then a sound is skipped, not queued. «Без звука» is kept per browser.
 */

type AudioContextCtor = typeof AudioContext;

let context: AudioContext | null = null;
let unlocked = false;
const audioListeners = new Set<() => void>();

function ctor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return window.AudioContext ?? (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext ?? null;
}

/** The page has had a click or a key already (this load): the browser lets it make sound. */
function activated(): boolean {
  const nav = typeof navigator === "undefined" ? null : (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } });
  return Boolean(nav?.userActivation?.hasBeenActive);
}

/**
 * Wake the audio — from a click or a key (`gesture`), or when the page has had one already.
 * Before that a context would only be born suspended and the browser would scold in the console.
 */
export function unlockAudio(gesture = false): void {
  const Ctor = ctor();
  if (!Ctor || (!gesture && !activated() && !unlocked)) return;
  try {
    context ??= new Ctor();
    void context
      .resume()
      .then(() => {
        if (unlocked) return;
        unlocked = true;
        for (const listener of audioListeners) listener();
      })
      .catch(() => undefined);
  } catch {
    // no audio here: the tab's words and the icon's dot still say it
  }
}

function subscribeAudio(listener: () => void): () => void {
  audioListeners.add(listener);
  return () => audioListeners.delete(listener);
}

/** Whether the browser lets this page make sound yet. */
export function useAudioUnlocked(): boolean {
  return useSyncExternalStore(subscribeAudio, () => unlocked, () => false);
}

/**
 * The context, only while it is running: a sound scheduled on a suspended one would wait and come
 * out later in a heap with the others. Born inside a click it runs at once.
 */
function ready(): AudioContext | null {
  if (!context) return null;
  if (context.state !== "running") {
    void context.resume().catch(() => undefined);
    return null;
  }
  return context;
}

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
    const ctx = ready();
    if (!ctx) return;
    const at = ctx.currentTime + 0.03;
    tone(ctx, 880, at, 0.55, 0.11);
    tone(ctx, 1318.5, at + 0.15, 0.85, 0.09);
  } catch {
    // no sound is no reason to disturb the desk
  }
}

/** One ring of «Охрана»: two short trills like an old telephone; DeskShell repeats it until taken. */
export function playRing(): void {
  try {
    const ctx = ready();
    if (!ctx) return;
    const at = ctx.currentTime + 0.03;
    for (const burst of [0, 0.62]) {
      for (let i = 0; i < 9; i += 1) tone(ctx, i % 2 ? 1046.5 : 1318.5, at + burst + i * 0.052, 0.07, 0.15);
    }
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

/** Whether this browser chimes and rings: on for the secretary, off for the director until chosen. */
export function useDeskSound(role: "director" | "secretary"): boolean {
  return useSyncExternalStore(
    subscribeSound,
    () => memory ?? parseSound(readSoundValue(), role),
    () => false,
  );
}
