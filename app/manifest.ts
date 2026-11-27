import type { MetadataRoute } from "next";

/**
 * The version of the icons' drawing: the worker keeps /icons/ cache-first and a phone keeps the icon
 * it installed, so a new drawing gets a new address (`scripts/make-icons.ts`). The same number
 * stands in app/layout.tsx, public/sw.js and DeskShell.
 */
const ICON_V = "?v=2";

/** Home-screen install: standalone window, brand colours, icons in public/icons — the mascot's mark. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pulse",
    short_name: "Pulse",
    description: "Голосовое управление компанией",
    lang: "ru",
    // the app's identity (D-125): equal to the old implicit one (start_url), so an installed
    // copy stays the same app; the scope keeps every route inside its window
    id: "/",
    scope: "/",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0B0F14",
    theme_color: "#0B0F14",
    icons: [
      { src: `/icons/icon-192.png${ICON_V}`, sizes: "192x192", type: "image/png" },
      { src: `/icons/icon-512.png${ICON_V}`, sizes: "512x512", type: "image/png" },
      { src: `/icons/maskable-512.png${ICON_V}`, sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
