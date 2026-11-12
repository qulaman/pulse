"use client";

import { createContext, useContext } from "react";

import type { CalendarEvent, Draft, Errand, EtherPost, StateId, Task } from "@/app/dev/pulse-alt/fixtures";

import type { Counts, Mood, Reply, Said } from "./model";

export type SheetKind = "tasks" | "messages" | "ether" | "calendar" | "rating" | "person" | "secretary";

export type Phase = "saving" | "transcribing" | "parsing" | "reply" | "kept" | "stt" | "noMic" | "sending";

export type Conv = { id: number; said: Said | null; phase: Phase; reply: Reply | null };

export type Rec = { mode: "hold" | "tap"; cancel: boolean; forDesk: boolean; offset?: number };

export type Toast = { id: number; text: string; undo?: () => void; tone?: "plain" | "ok" };

export type Picker = { for: "draft"; id: string } | { for: "task"; id: string; verb: string };
export type When = { for: "draft"; id: string } | { for: "task"; id: string };

/** Who a batch landed on and how: a task is read («увидел 10:41»), points arrive, a repeat starts later. */
export type LandedItem = { id: string; kind: "task" | "points" | "recurrence"; note?: string };
export type Landed = { line: string; items: LandedItem[]; morning: boolean };

export type Dispute = { id: string; personId: string; amount: number; reason: string; plea: string; at: string; keys: string[] };

export type Api = {
  initial: StateId;
  now: Date;
  offhours: boolean;
  empty: boolean;
  mood: Mood;
  counts: Counts;
  pristine: boolean;

  tasks: Task[];
  ether: EtherPost[];
  events: CalendarEvent[];
  disputes: Dispute[];
  errands: Errand[];
  drafts: Draft[];

  conv: Conv | null;
  rec: Rec | null;
  typing: boolean;
  text: string;
  pin: string | null;
  awake: boolean;
  landed: Landed | null;
  offline: boolean;
  kept: number;
  visitor: boolean;
  secMessage: boolean;
  meetingOffer: "ask" | "done" | "no";
  service: { push: boolean; install: boolean; draft: boolean };
  dnd: boolean;
  /** everybody has left the reception: an empty chair and «до 14:00» */
  deskAway: string | null;

  sheet: SheetKind | null;
  personId: string | null;
  thread: string | null;
  threadFocus: boolean;
  actions: string | null;
  picker: Picker | null;
  when: When | null;
  repeat: string | null;
  event: string | null;
  install: boolean;
  pops: string[];

  // board
  setAwake: (v: boolean) => void;
  openSheet: (kind: SheetKind, personId?: string) => void;
  closeSheet: () => void;
  openThread: (taskId: string, focus?: boolean) => void;
  closeThread: () => void;
  openActions: (taskId: string | null) => void;
  setPicker: (p: Picker | null) => void;
  setWhen: (w: When | null) => void;
  setRepeat: (id: string | null) => void;
  setEvent: (id: string | null) => void;
  setInstall: (v: boolean) => void;

  // speaking
  holdStart: (forDesk?: boolean) => void;
  holdMove: (dy: number) => void;
  holdEnd: () => void;
  holdCancel: () => void;
  tapMic: () => void;
  setTyping: (v: boolean, prefill?: string) => void;
  setText: (v: string) => void;
  submitText: () => void;
  setPin: (id: string | null) => void;

  // the phrase in hand
  closeConv: () => void;
  editDraft: (id: string, patch: Partial<Draft>) => void;
  removeDraft: (id: string) => void;
  restoreDraft: (id: string) => void;
  removed: string[];
  send: (morning: boolean) => void;
  unparsedToTask: () => void;
  fixText: () => void;
  reconnect: () => void;
  showKept: () => void;

  // tasks
  act: (taskId: string, key: string) => void;
  answer: (taskId: string, text: string, voiceSec?: number) => void;
  setDeadline: (taskId: string, iso: string, label: string) => void;
  reassign: (taskId: string, personId: string) => void;

  // the rest of the board
  react: (postId: string, emoji: string) => void;
  resolveDispute: (id: string, key: string) => void;
  errand: (code: string, note?: string, when?: string) => void;
  thank: (errandId: string) => void;
  visitorAnswer: (key: string, extras: string[]) => void;
  messageSeen: () => void;
  answerMeeting: (yes: boolean) => void;
  serviceDo: (key: "push" | "install" | "draft" | "noTeam") => void;
  toast: (text: string, undo?: () => void) => void;
  note: (text: string) => void;
};

export const Ctx = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(Ctx);
  if (!api) throw new Error("Pulse prototype context is missing");
  return api;
}
