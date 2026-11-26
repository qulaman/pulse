"use client";

import { useSyncExternalStore } from "react";

import { SoundIcon } from "@/components/profile/icons";
import { Row } from "@/components/ui/Row";
import { setSoundOn, sound, soundOn, subscribeSound, unlockAudio } from "@/lib/sound";

/**
 * «Звук» (D-204): the person's own actions are heard — sent, accepted, done — unless this device
 * was told to stay quiet. Turning it on plays one sound, so the person hears what was turned on.
 */
export function SoundRow() {
  const on = useSyncExternalStore(subscribeSound, soundOn, () => true);
  const turn = (next: boolean) => {
    setSoundOn(next);
    if (!next) return;
    unlockAudio(true);
    sound("check");
  };
  return <Row icon={<SoundIcon />} title="Звук" toggle={{ on, onChange: turn }} />;
}
