import type { MetadataRoute } from "next";

/** Home-screen install: standalone window, brand colours, icons in public/icons. */
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
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
