"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent, ReactNode } from "react";

import { useDeskScope } from "@/components/desk/DeskScope";
import { deskRouteFor } from "@/lib/desk/routes";

type Router = ReturnType<typeof useRouter>;

/**
 * Goes to a desk address. The same screen with another query (`/desk/settings?tab=team` from the
 * settings themselves) only swaps the address — the screen reads it and keeps what is open and
 * half-typed, as the phone's tabs do; another screen is a navigation.
 */
export function goDesk(router: Router, target: string) {
  const url = new URL(target, window.location.href);
  if (url.pathname === window.location.pathname) {
    window.history.replaceState(null, "", `${url.pathname}${url.search}`);
    return;
  }
  router.push(`${url.pathname}${url.search}`);
}

/**
 * The phone's screens and parts are reused on the desk as they are, and they link to phone
 * addresses (`/settings?tab=team`, `/lab?tab=parser`, `/tasks/<id>`, `/people/<id>`). A plain
 * click on such a link goes straight to its desk twin instead of a round trip through the proxy;
 * a link with no twin (the lab's shelf of pages) and a click meant for a new tab are left alone.
 * The shell wraps the screen and the panel in it; `contents` keeps it out of the layout.
 */
export function DeskLinks({ children, className }: { children: ReactNode; className?: string }) {
  const router = useRouter();
  const { role } = useDeskScope();

  const onClickCapture = (event: MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element).closest("a[href]");
    if (!(anchor instanceof HTMLAnchorElement) || (anchor.target && anchor.target !== "_self")) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const target = deskRouteFor(url.pathname, url.search, role);
    if (!target) return;
    // Next's <Link> leaves a click whose default is already prevented to us
    event.preventDefault();
    goDesk(router, target);
  };

  return (
    <div className={className} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
