"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { addTransitionType, createContext, startTransition, useContext, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";

import { addressKey, followNext, moveBetween, remember, splitAddress, wrote, type DeskAddressState } from "@/lib/desk/address-state";

/**
 * The desk's address as React state (D-184). Next carries an address written with
 * `history.replaceState` into `useSearchParams` from a promise — outside any transition — so a
 * screen that reads its `?…` from there changes in a commit no view transition can join. A desk
 * screen reads its query here (`useDeskParams`) and writes it here (`writeDeskAddress`): Next is
 * told the address at once, as before — its links, a refresh, Back and the address bar (Next
 * writes its own address back into the bar on each of its renders) stay with the desk — and the
 * screens' state changes in a transition, so what moves on the screen can move. Next catching up
 * with an address the desk wrote is only noted; Next's own moves (a link, `router.push`) win.
 */

let writer: ((path: string, search: string) => void) | null = null;
function listen(next: typeof writer) {
  writer = next;
}

/**
 * The desk's last writes Next has not caught up with yet: Next coming back with one of them is
 * catching up, not a move. Forgotten once caught up — Next's own later move to the same address (a
 * reminder's `router.push`) is a move again.
 */
let written: string[] = [];
function markWritten(key: string) {
  written = remember(written, key);
}
function isWritten(key: string): boolean {
  return written.includes(key);
}
function forget(key: string) {
  if (written.includes(key)) written = written.filter((k) => k !== key);
}

/** What the desk shows now — Back and Forward compare the entry they reach with it. */
let shown = { path: "", search: "" };
function showing(path: string, search: string) {
  shown = { path, search };
}

const AddressContext = createContext<URLSearchParams | null>(null);

/** The shell's half: holds the address for every screen under it. */
export function DeskAddress({ children }: { children: ReactNode }) {
  const path = usePathname();
  const fromNext = useSearchParams().toString();
  const seen = addressKey(path, fromNext);
  const [address, setAddress] = useState<DeskAddressState>({ seen, path, search: fromNext });
  let now = address;
  if (address.seen !== seen) {
    // an updater, not a value: a write still waiting in its transition is rebased over it
    const ours = isWritten(seen);
    now = followNext(address, path, fromNext, ours);
    setAddress((was) => followNext(was, path, fromNext, ours));
  }

  useEffect(() => {
    listen((at, search) => setAddress((was) => wrote(was, at, search)));
    return () => listen(null);
  }, []);
  // Next has caught up with this address (or moved to it): from now on it is Next's again
  const seenNow = now.seen;
  useLayoutEffect(() => forget(seenNow), [seenNow]);

  const nowPath = now.path;
  const nowSearch = now.search;
  useLayoutEffect(() => showing(nowPath, nowSearch), [nowPath, nowSearch]);

  // Back and Forward inside the screen (D-184) replay the step they undo — a tab swaps, a thing in
  // the panel changes in place (`moveBetween`). Next takes a traversal in on the Navigation API's
  // `navigate` and commits it at once, without a transition; so the desk marks the entry as its own
  // on that same event, ahead of Next (capture): Next coming back with it is only noted, and the desk
  // plays the change itself on `popstate`. Without the Navigation API — at once.
  useEffect(() => {
    const nav = (window as Window & { navigation?: EventTarget }).navigation;
    const ahead = (event: Event) => {
      const going = event as Event & { navigationType?: string; destination?: { url: string } };
      if (going.navigationType !== "traverse" || !going.destination) return;
      const url = new URL(going.destination.url);
      if (url.pathname === shown.path) markWritten(addressKey(url.pathname, url.search.slice(1)));
    };
    const back = () => {
      const { pathname, search } = window.location;
      const text = search.slice(1);
      if (pathname !== shown.path) return;
      markWritten(addressKey(pathname, text));
      // the step's look from what is drawn; whether to step at all — against the state still queued
      // (a write held behind a playing transition), so the screen always ends where the address is
      const type = moveBetween(shown.search, text);
      const step = () => setAddress((was) => (was.path === pathname && was.search !== text ? { ...was, search: text } : was));
      if (!type) {
        step();
        return;
      }
      // React renders a transition started inside `popstate` at once and without a view transition:
      // the step starts a task later, out of the event — Next's arrival is only noted meanwhile
      setTimeout(() =>
        startTransition(() => {
          addTransitionType(type);
          step();
        }),
      );
    };
    // capture: ahead of Next, which takes a traversal in on `navigate` already
    nav?.addEventListener("navigate", ahead, { capture: true });
    window.addEventListener("popstate", back);
    return () => {
      nav?.removeEventListener("navigate", ahead, { capture: true });
      window.removeEventListener("popstate", back);
    };
  }, []);

  const params = useMemo(() => new URLSearchParams(now.search), [now.search]);
  return <AddressContext.Provider value={params}>{children}</AddressContext.Provider>;
}

/**
 * The query of the desk's address — what `useSearchParams` gives, with the desk's own writes
 * already in it. Off the desk (a phone part reused there) it is Next's.
 */
export function useDeskParams(): URLSearchParams {
  const desk = useContext(AddressContext);
  const next = useSearchParams();
  return desk ?? next;
}

/**
 * A quick hand is never held (principle 1a): React makes a transition wait for the one still
 * playing, so a write from the keys this soon after the last one is drawn at once, without a move.
 */
const BURST_MS = 350;
let lastBurst = -Infinity;
function inBurst(): boolean {
  const at = performance.now();
  const quick = at - lastBurst < BURST_MS;
  lastBurst = at;
  return quick;
}

function endTransition() {
  (document as Document & { activeViewTransition?: { skipTransition(): void } | null }).activeViewTransition?.skipTransition();
}

/**
 * Writes an address of the screen that is open. `push` — a step of the browser's history (Back
 * undoes it), else the entry is replaced. `type` — a transition type for the screen's
 * `<ViewTransition>`s (`update={{ "desk-switch": "…", default: "none" }}`); a write without a type
 * moves nothing and is drawn at once, as Next drew it — a step of days, a filter. `now` — drawn at
 * once, cutting the transition still playing; `burst` — a write from the keys: at once when it
 * follows the last such write within {@link BURST_MS} (a held arrow, a quick hand).
 * Another path is a navigation — `router.push`'s, not this; such an address is loaded whole.
 */
export function writeDeskAddress(href: string, options: { push?: boolean; type?: string; now?: boolean; burst?: boolean } = {}) {
  const { path, search } = splitAddress(href, window.location.href);
  const target = search ? `${path}?${search}` : path;
  if (`${window.location.pathname}${window.location.search}` === target) return;
  if (path !== window.location.pathname) {
    if (options.push) window.location.assign(target);
    else window.location.replace(target);
    return;
  }
  const write = writer;
  if (write) markWritten(addressKey(path, search));
  // Next's own history calls: the bar, the entry with Next's tree, Next's address — all at once
  if (options.push) window.history.pushState(null, "", target);
  else window.history.replaceState(null, "", target);
  if (!write) return;
  if (options.now || (options.burst && inBurst())) {
    endTransition();
    write(path, search);
    return;
  }
  if (!options.type) {
    write(path, search);
    return;
  }
  startTransition(() => {
    if (options.type) addTransitionType(options.type);
    write(path, search);
  });
}

/**
 * A change of a screen's own state that should move like a write of the address (D-184): a view
 * kept in state, a thing opened in the panel from a list that has no address. `type` as in
 * `writeDeskAddress`.
 */
export function moveWith(type: string, update: () => void) {
  startTransition(() => {
    addTransitionType(type);
    update();
  });
}
