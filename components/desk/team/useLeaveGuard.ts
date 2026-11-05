"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { chordHref } from "@/lib/desk/routes";

/** As long as the shell waits for the letter after «G». */
const CHORD_MS = 1500;

/** The part of the Navigation API used here; a browser without it simply is not asked. */
type NavigateEvent = Event & { navigationType: string; cancelable: boolean; destination: { key: string } };
type TabNavigation = EventTarget & { traverseTo: (key: string) => unknown };

/**
 * Asks before an unsaved form is left (`ask(go)`; `go` carries on with the way out). The App
 * Router has no way to refuse a navigation, so the three ways out that can be seen coming are
 * caught before it does anything: a click on a link (the side nav, «Команда ›»), «G + буква»
 * (the shell never starts the chord: here the key is taken a phase earlier), and the browser's
 * Back and Forward (the Navigation API cancels the traversal; popstate cannot, it comes after the
 * router's own listener). `router.push` from elsewhere cannot be seen — the palette, the profile
 * menu — and neither can Back where the browser does not let it be cancelled: that way out is
 * caught by the form itself as it unmounts (`keepDraft`). `passed` — the form lets go by itself.
 */
export function useLeaveGuard(dirty: boolean, passed: RefObject<boolean>, ask: (go: () => void) => void) {
  const router = useRouter();
  const { role } = useDeskScope();
  const latest = useRef(ask);
  useLayoutEffect(() => {
    latest.current = ask;
  });

  useEffect(() => {
    if (!dirty) return;
    const free = () => passed.current;

    const onClick = (event: MouseEvent) => {
      if (free() || event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.<HTMLAnchorElement>("a[href]");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      // before Next's own handler on the root
      event.preventDefault();
      event.stopPropagation();
      latest.current(() => router.push(`${url.pathname}${url.search}${url.hash}`));
    };

    let chord: ReturnType<typeof setTimeout> | null = null;
    const endChord = () => {
      if (chord) clearTimeout(chord);
      chord = null;
    };
    const onKey = (event: KeyboardEvent) => {
      if (free()) return;
      if (chord) {
        endChord();
        const href = isPlainKey(event) && !event.shiftKey ? chordHref(event.code, role) : null;
        if (!href) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        latest.current(() => router.push(href));
        return;
      }
      const modal = document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open");
      if (event.code !== "KeyG" || !isPlainKey(event) || event.shiftKey || event.repeat || modal || isTypingTarget(event.target)) return;
      // the shell skips a key already taken, so its own chord does not start
      event.preventDefault();
      chord = setTimeout(endChord, CHORD_MS);
    };

    const tab = (window as unknown as { navigation?: TabNavigation }).navigation;
    const onNavigate = (raw: Event) => {
      const event = raw as NavigateEvent;
      if (free() || event.navigationType !== "traverse" || !event.cancelable) return;
      event.preventDefault();
      const { key } = event.destination;
      latest.current(() => tab?.traverseTo(key));
    };

    // closing the tab with unsaved words asks too — the browser's own question
    const onUnload = (event: BeforeUnloadEvent) => {
      if (!free()) event.preventDefault();
    };

    document.addEventListener("click", onClick, true);
    document.addEventListener("keydown", onKey, true);
    tab?.addEventListener("navigate", onNavigate);
    window.addEventListener("beforeunload", onUnload);
    return () => {
      endChord();
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("keydown", onKey, true);
      tab?.removeEventListener("navigate", onNavigate);
      window.removeEventListener("beforeunload", onUnload);
    };
  }, [dirty, passed, role, router]);
}

/** A draft that left without a word, waiting for its form in this tab's memory — never in storage: a form may hold a first password. */
const kept = new Map<string, unknown>();

export function keepDraft<T>(key: string, draft: T): void {
  kept.set(key, draft);
}

/** What was kept for this form, without taking it — a Strict Mode double render reads it twice. */
export function peekDraft<T>(key: string): T | null {
  return (kept.get(key) as T | undefined) ?? null;
}

/** Taken: the form has it in its own state now. */
export function dropDraft(key: string): void {
  kept.delete(key);
}
