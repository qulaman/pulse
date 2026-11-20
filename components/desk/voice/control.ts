"use client";

import { keysTaken } from "@/components/desk/ui/layers";
import { CAN_START } from "@/lib/desk/voice";
import { useIngestStore, type Pin } from "@/lib/store/ingest";

/** The person pinned in the order line: the address goes in front of the words, the id to the parser (D-84). */
export type VoicePin = Pin & { address: string };

/**
 * The microphone of the desk (D-164): one start, one «готово», one «отмена» for the button in the
 * line, its key and the buttons in the panel. The recording itself is the phone's pipeline
 * (`useIngestStore`): saved to Storage before any AI (principle 5), the same parse, the same
 * confirm — nothing of it is bypassed here.
 *
 * The browser may still be asking for the microphone when «готово» or «отмена» comes: both wait
 * for that answer first, or a recorder stopped before it started would leave the microphone on.
 */
let starting: Promise<void> | null = null;

/** Dictaphones of the pages recording right now (D-177): the order line waits — one microphone at a time. */
let pagesRecording = 0;

/** A page's dictaphone started (true) or stopped (false) listening. */
export function markPageRecording(on: boolean): void {
  pagesRecording = Math.max(0, pagesRecording + (on ? 1 : -1));
}

/** A page's dictaphone is listening: the order line's microphone must not open a second one. */
export function pageRecording(): boolean {
  return pagesRecording > 0;
}

export function startDeskVoice(pin?: VoicePin | null): void {
  const store = useIngestStore.getState();
  if (!CAN_START.has(store.stage) || pageRecording()) return;
  starting = pin ? store.startVoice(pin.address, { id: pin.id, name: pin.name }) : store.startVoice();
}

/** Stop and send the recording on its way (upload → transcribe → parse); the panel follows it. */
export async function finishDeskVoice(): Promise<void> {
  const pending = starting;
  starting = null;
  await pending;
  const store = useIngestStore.getState();
  if (store.stage !== "recording") return;
  void store.stopVoice();
}

/** Drop the recording unsent; a phrase already on its way is not touched. */
export async function cancelDeskVoice(): Promise<void> {
  const pending = starting;
  starting = null;
  await pending;
  const store = useIngestStore.getState();
  if (store.stage === "recording") store.cancelVoice();
}

/** Something of the desk holds the keys right now: a dialog, a sheet, a popover or a menu. */
/** @deprecated the same rule — use `keysTaken` from "@/components/desk/ui/layers". */
export const deskLayerUp = keysTaken;
