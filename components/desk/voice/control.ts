"use client";

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

export function startDeskVoice(pin?: VoicePin | null): void {
  const store = useIngestStore.getState();
  if (!CAN_START.has(store.stage)) return;
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
export function deskLayerUp(): boolean {
  const body = document.body;
  return body.hasAttribute("data-dialog-open") || body.hasAttribute("data-sheet-open") || document.querySelector(".desk-pop") !== null;
}
