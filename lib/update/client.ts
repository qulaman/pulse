"use client";

import { useEffect } from "react";
import { create } from "zustand";

import { BUILD, type BuildInfo, type UpdateMark } from "@/lib/version";

/**
 * «Обновить» was tapped — on the line or in Профиль; the update waits only for unsaved work.
 * Spent once the phone is current again, so a later deploy never rides an old tap.
 */
export const useUpdateRequest = create<{ requested: boolean; request: () => void; cancel: () => void }>((set) => ({
  requested: false,
  request: () => set({ requested: true }),
  cancel: () => set({ requested: false }),
}));

/** What the server runs now (D-115). Throws on a dead network — the query keeps the last answer. */
export async function fetchServerVersion(): Promise<BuildInfo> {
  // same-origin credentials: a protected preview deployment answers only with its cookie
  const res = await fetch("/api/version", { cache: "no-store" });
  if (!res.ok) throw new Error(`version ${res.status}`);
  const body = (await res.json()) as Partial<BuildInfo>;
  if (typeof body.id !== "string" || typeof body.compat !== "number") throw new Error("version: bad body");
  return { id: body.id, sha: body.sha ?? "", at: body.at ?? null, compat: body.compat };
}

// ---- «busy»: what a reload would lose -------------------------------------------------

const holds = new Set<symbol>();

/**
 * Something that lives only in this page's memory and would die with a reload: a recording,
 * a parsed phrase waiting on the board, a voice note being uploaded. Returns the release.
 */
export function holdUpdate(): () => void {
  const key = Symbol("hold");
  holds.add(key);
  return () => {
    holds.delete(key);
  };
}

/** A screen with a draft of its own holds the update while `active`. */
export function useUpdateHold(active: boolean): void {
  useEffect(() => {
    if (!active) return;
    return holdUpdate();
  }, [active]);
}

const TEXT_INPUT =
  "input:not([type='checkbox']):not([type='radio']):not([type='button']):not([type='submit']):not([type='reset']):not([type='range']):not([type='file']):not([type='hidden']):not([type='color'])";
const EDITABLE = `textarea, select, [contenteditable]:not([contenteditable='false']), ${TEXT_INPUT}`;

/**
 * A reload now would lose something: an explicit hold, or a field on the screen with words
 * in it — a half-typed thread reply, a person's card, an event's title. Whatever keeps
 * itself (an autosaving editor) opts out with `data-update-safe` and holds only while its
 * save is pending. Requests in flight are counted by the caller — the query client lives there.
 */
export function hasUnsaved(): boolean {
  if (holds.size > 0) return true;
  if (typeof document === "undefined") return false;
  for (const field of document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(`textarea, ${TEXT_INPUT}`)) {
    if (field.disabled || field.readOnly || field.value.trim() === "") continue;
    if (field.closest("[data-update-safe]")) continue;
    if (field.getClientRects().length > 0) return true;
  }
  return false;
}

/** A field has the focus — maybe mid-word. Enough to skip a quiet update, not to refuse a tap. */
export function isTyping(): boolean {
  if (typeof document === "undefined") return false;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body && active.matches(EDITABLE);
}

// ---- the reload itself --------------------------------------------------------------------

const MARK_KEY = "pulse.update.mark";

function writeMark(mark: UpdateMark): void {
  try {
    window.sessionStorage.setItem(MARK_KEY, JSON.stringify(mark));
  } catch {
    // private mode: the update still happens, only the «Обновил» line after it is lost
  }
}

/** The mark the previous page left right before reloading — read once, then gone. */
export function takeMark(): UpdateMark | null {
  try {
    const raw = window.sessionStorage.getItem(MARK_KEY);
    window.sessionStorage.removeItem(MARK_KEY);
    if (!raw) return null;
    const mark = JSON.parse(raw) as Partial<UpdateMark>;
    return typeof mark.from === "string" && typeof mark.at === "number" ? { from: mark.from, at: mark.at } : null;
  } catch {
    return null;
  }
}

function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  return Promise.race([promise, new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms))]);
}

let applying = false;

/**
 * Bring this page to the server's build. The worker keeps screens network-first and the build's
 * files under their own names (D-127), so a reload brings the new build; the worker is still
 * asked first, so that a waiting one takes over before the reload instead of serving old files.
 */
export async function applyUpdate(): Promise<void> {
  if (applying) return;
  applying = true;
  // a reload that never came (a leave-page prompt was refused) must not lock the button
  setTimeout(() => {
    applying = false;
  }, 8_000);
  writeMark({ from: BUILD.id, at: Date.now() });
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await within(registration.update().catch(() => undefined), 2_000);
      const waiting = registration.waiting;
      if (waiting) {
        const taken = new Promise<void>((resolve) =>
          navigator.serviceWorker.addEventListener("controllerchange", () => resolve(), { once: true }),
        );
        waiting.postMessage({ type: "SKIP_WAITING" });
        await within(taken, 3_000);
      }
    }
  } catch {
    // no worker, or it refused: a plain reload still brings the new pages
  }
  window.location.reload();
}
