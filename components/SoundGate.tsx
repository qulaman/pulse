"use client";

import { useEffect } from "react";

import { soundOn, unlockAudio } from "@/lib/sound";

/**
 * Wakes the app's audio on a touch or a key (D-204): a browser plays nothing before the person
 * has touched the page, and a phone's audio sleeps again after half a minute of quiet. One
 * listener for the whole app; with «Звук» off on this device the audio is never born.
 *
 * A finger going down is not a gesture for iOS, a finger coming up is — both are heard.
 */
export function SoundGate() {
  useEffect(() => {
    const wake = () => {
      if (soundOn()) unlockAudio(true);
    };
    const options = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", wake, options);
    document.addEventListener("pointerup", wake, options);
    document.addEventListener("keydown", wake, options);
    return () => {
      document.removeEventListener("pointerdown", wake, options);
      document.removeEventListener("pointerup", wake, options);
      document.removeEventListener("keydown", wake, options);
    };
  }, []);
  return null;
}
