"use client";

import { useSyncExternalStore } from "react";

import { VibrateIcon } from "@/components/profile/icons";
import { Row } from "@/components/ui/Row";
import { hapticsOn, setHapticsOn, subscribeHaptics } from "@/lib/haptics";

/**
 * «Вибрация при нажатии» (D-147): every tap ticks by default; a person who does not like it
 * turns it off for this phone — the tap's tick and the patterns of their own alike.
 */
export function HapticsRow() {
  const on = useSyncExternalStore(subscribeHaptics, hapticsOn, () => true);
  return <Row icon={<VibrateIcon />} title="Вибрация при нажатии" toggle={{ on, onChange: setHapticsOn }} />;
}
