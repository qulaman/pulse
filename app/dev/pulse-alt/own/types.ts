/** Shared shapes of the «Чей ход» screen state. */
import type { Draft } from "@/app/dev/pulse-alt/fixtures";

export type Failure = "short" | "nomic" | "stt" | "kept";

export type Panel = "tasks" | "messages" | "ether" | "calendar" | "rating" | "person" | "secretary";

/** What the ground (the director's side) is showing. */
export type Layer = "home" | "recording" | "parsing" | "confirm" | "unparsed" | "answer" | "failure" | "text" | Panel;

export type DraftRef = { draftId: string } | { taskId: string; why: "reassign" | "pass" | "deadline" } | { pin: true };

export type SheetT =
  | { kind: "thread"; taskId: string; compose?: string }
  | { kind: "actions"; taskId: string }
  | { kind: "picker"; target: DraftRef }
  | { kind: "deadline"; target: DraftRef }
  | { kind: "repeat"; draftId: string }
  | { kind: "event"; eventId: string }
  | { kind: "service" }
  | { kind: "kept" };

/** Who the key speaks to right now. */
export type Pin = { kind: "person"; id: string } | { kind: "all" } | { kind: "secretary" } | null;

/** What a recording turns into once parsed. */
export type Outcome = "draft" | "pinned" | "all" | "query" | "unparsed" | "stt" | "errand";

export type Comet = { id: number; x0: number; y0: number; x1: number; y1: number; delay: number; big?: boolean; label?: string };

export type Flash = { title: string; sub?: string; tone: "lime" | "mint" | "quiet" | "night" };

export type KeptPhrase = { id: string; at: string; sec: number; text: string; kind: "voice" | "errand" };

export type DraftItem = Draft & { edited?: boolean };
