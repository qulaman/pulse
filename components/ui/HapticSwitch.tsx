"use client";

import { useSyncExternalStore } from "react";

import { iosHapticMode, subscribeHaptics, type IosHapticMode } from "@/lib/haptics";

/** Safari's switch control (17.4+); React passes the unknown attribute through as it is. */
const SWITCH = { switch: "" } as Record<string, string>;

const serverMode = (): IosHapticMode => "off";

/** The way an iPhone ticks on this phone; «off» on the server and in the first frame. */
export function useIosHapticMode(): IosHapticMode {
  return useSyncExternalStore(subscribeHaptics, iosHapticMode, serverMode);
}

/**
 * The iPhone's tick under the finger (D-147). Safari has no Vibration API; a switch control
 * ticks when the finger itself toggles it — since iOS 26.5 never from script. So a tap
 * primitive carries one, transparent over the whole control: the tap lands on it, it ticks,
 * and the click goes on to the control as the tap's own. Which way ticks — the switch inside
 * a label, or the bare switch stretched — is checked on a real iPhone in «Лаб → Вибрация»;
 * until a phone picks one there, nothing is drawn. The host is `position: relative`.
 */
export function HapticSwitch({ mode: forced }: { mode?: Exclude<IosHapticMode, "off"> }) {
  const chosen = useIosHapticMode();
  const mode = forced ?? chosen;
  if (mode === "off") return null;
  if (mode === "input") {
    return (
      <input
        type="checkbox"
        {...SWITCH}
        tabIndex={-1}
        aria-hidden
        className="absolute inset-0 z-[1] m-0 h-full w-full cursor-pointer opacity-0"
        data-haptic-switch=""
      />
    );
  }
  return (
    <label aria-hidden className="absolute inset-0 z-[1] cursor-pointer opacity-0" data-haptic-switch="">
      {/* the label hands the tap to its switch as a second click: that one stops here, so the
          control under the finger hears the tap once */}
      <input type="checkbox" {...SWITCH} tabIndex={-1} className="pointer-events-none absolute h-px w-px opacity-0" onClick={(event) => event.stopPropagation()} />
    </label>
  );
}
