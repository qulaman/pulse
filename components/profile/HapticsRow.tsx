"use client";

import { useSyncExternalStore } from "react";

import { usePlatform } from "@/components/profile/HapticsChoice";
import { VibrateIcon } from "@/components/profile/icons";
import { useIosHapticMode } from "@/components/ui/HapticSwitch";
import { Row } from "@/components/ui/Row";
import { hapticsOn, iosHapticPicked, setHapticsOn, subscribeHaptics } from "@/lib/haptics";

/**
 * «Вибрация при нажатии» (D-147): every tap ticks by default; a person who does not like it
 * turns it off for this phone — the tap's tick and the patterns of their own alike. On an iPhone
 * the row leads to «Вибрация», where the person picks the way the phone ticks (D-193): until then
 * an iPhone stays silent, so the row says «выбрать».
 */
export function HapticsRow() {
  const on = useSyncExternalStore(subscribeHaptics, hapticsOn, () => true);
  const mode = useIosHapticMode();
  const platform = usePlatform();
  const picked = useSyncExternalStore(subscribeHaptics, iosHapticPicked, () => true);
  if (platform === "ios") {
    const value = !on ? "выключена" : !picked ? "выбрать" : mode === "off" ? "без щелчка" : "включена";
    return (
      <Row
        icon={<VibrateIcon />}
        title="Вибрация при нажатии"
        value={value}
        valueColor={on && !picked ? "var(--accent)" : undefined}
        href="/profile/haptics"
      />
    );
  }
  return <Row icon={<VibrateIcon />} title="Вибрация при нажатии" toggle={{ on, onChange: setHapticsOn }} />;
}
