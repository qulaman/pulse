import type { Metadata, Viewport } from "next";
import { unstable_rethrow } from "next/navigation";
import localFont from "next/font/local";

import { AppUpdate } from "@/components/AppUpdate";
import { ArrivalLayer } from "@/components/auth/ArrivalLayer";
import { MascotPower } from "@/components/brand/MascotPower";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OutboxReplay } from "@/components/OutboxReplay";
import { MediaReplay } from "@/components/MediaReplay";
import { NotOnOps } from "@/components/NotOnOps";
import { SessionWatch } from "@/components/auth/SessionWatch";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PushSync } from "@/components/push/PushSync";
import { SecretaryAlarmGate } from "@/components/secretary/SecretaryAlarm";
import { ErrandReplay } from "@/components/secretary/ErrandReplay";
import { TapHaptics } from "@/components/TapHaptics";
import { getSessionProfile } from "@/lib/auth";
import { loadBrand, PRODUCT_BRAND } from "@/lib/brand";
import { DESK_SHEET_SCRIPT } from "@/lib/desk/device";
import { QUIET_LOOPS } from "@/lib/design/quiet-loops";
import { INSTALL_CATCHER } from "@/lib/push/install-catcher";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

// One face for every letter on every screen, phone and desk alike: Golos Text, variable 400–900
// (D-179). The file lives in the repo, so a build never asks Google for it (the way IBM Plex once
// failed the Vercel build, below). It is Google Fonts' GolosText[wght].ttf v2.004 cut to the union
// of the four ranges Google serves the family in (cyrillic, cyrillic-ext, latin, latin-ext) —
// 70 KB, one preloaded file where Google's three preloaded ones were 77 KB; cyrillic-ext holds
// the Kazakh letters (Ә Ғ Қ Ң Ө Ү Һ), so a name reads in one face offline too:
//   pyftsubset GolosText[wght].ttf --unicodes=<the four ranges> --layout-features='*'
//     --name-IDs='*' --notdef-outline --no-hinting --flavor=woff2
// The fallback while it loads is Arial brought to Golos's metrics, as next/font/google made it.
const golos = localFont({
  src: "./fonts/golos-text.woff2",
  weight: "400 900",
  variable: "--font-golos",
  display: "swap",
  adjustFontFallback: "Arial",
});
// Golos's figures are of uneven width (a timer jitters, a column will not line up), so every digit
// comes from a cut of Inter that holds only 0–9 : + − % — Inter's latin file (opsz, wght) from
// Google Fonts cut with
//   pyftsubset inter-latin.woff2 --unicodes=U+0025,U+002B,U+0030-003A,U+2212 --layout-features='*'
//     --name-IDs='*' --notdef-outline --no-hinting --flavor=woff2
// It stands first in the stack (globals.css) and its range hands every other character on to Golos.
// Its figures are brought to Golos's capital height (700 of 1000 vs Inter's 1490 of 2048) and it
// takes Golos's vertical metrics (980 / 220, divided by the same size): a digit never changes the
// height of a line. No fallback face — until the 12 KB file lands, the digits are Golos's own.
const digits = localFont({
  src: "./fonts/inter-digits.woff2",
  weight: "100 900",
  variable: "--font-digits",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    { prop: "unicode-range", value: "U+0025, U+002B, U+0030-003A, U+2212" },
    { prop: "size-adjust", value: "96.22%" },
    { prop: "ascent-override", value: "101.85%" },
    { prop: "descent-override", value: "22.86%" },
    { prop: "line-gap-override", value: "0%" },
  ],
});

// The desk's three voices (D-158). `preload: false`: only a page that sets them in type fetches a
// file, so a phone never does. The files live in the repo, not fetched from Google at build time:
// for IBM Plex Sans (a wdth axis on Google) Google once answered the Vercel builder with
// `/l/font?kit=…&skey=…` URLs, and Turbopack's next/font/google cannot take an `&` in a font URL —
// the whole build failed. Each file is Google Fonts' full TTF of that weight cut to exactly the
// unicode ranges Google serves for the family, so every letter falls back as before:
//   pyftsubset <family>-<weight>.ttf --unicodes=<the family's ranges> --layout-features='*'
//     --name-IDs='*' --notdef-outline --no-hinting --flavor=woff2
// Sans and Mono hold Russian and Kazakh letters and ₸. Condensed holds no Russian letters (nor does
// Google's): it speaks in figures, and Russian words in its place fall back to Plex Sans — so it
// has no Arial fallback face that would catch them first (app/desk/journal.css). Mono has none
// either, as on Google: a missing glyph falls through to the monospace stack.
const plexSans = localFont({
  src: [
    { path: "./fonts/plex-sans-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-sans-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plex-sans-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-sans",
  display: "swap",
  preload: false,
});
const plexCond = localFont({
  src: [
    { path: "./fonts/plex-sans-condensed-500.woff2", weight: "500", style: "normal" },
    { path: "./fonts/plex-sans-condensed-600.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-plex-cond",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});
const plexMono = localFont({
  src: [
    { path: "./fonts/plex-mono-400.woff2", weight: "400", style: "normal" },
    { path: "./fonts/plex-mono-500.woff2", weight: "500", style: "normal" },
  ],
  variable: "--font-plex-mono",
  display: "swap",
  preload: false,
  adjustFontFallback: false,
});

export const metadata: Metadata = {
  title: "Pulse",
  description: "Голосовое управление компанией",
  applicationName: "Pulse",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // iOS home-screen install: own window, dark status bar
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Pulse" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0B0F14",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // the accent (contrast-checked) of the viewer's own company overrides the token; nobody signed
  // in — the product's own (D-134). The session read is the one every layout below makes anyway
  // (cached per request); a failure of it only means the product's accent — Next's own signals
  // (a page going dynamic, a redirect) pass through untouched
  let companyId: string | null = null;
  try {
    companyId = (await getSessionProfile()).companyId;
  } catch (error) {
    unstable_rethrow(error);
  }
  const brand = companyId ? await loadBrand(companyId) : PRODUCT_BRAND;
  return (
    <html
      lang="ru"
      className={`${golos.variable} ${digits.variable} ${plexSans.variable} ${plexCond.variable} ${plexMono.variable}`}
      // the desk's attributes land before hydration, from the script below
      suppressHydrationWarning
      style={brand.customAccent ? ({ "--accent": brand.accent } as React.CSSProperties) : undefined}
    >
      <head>
        {/* before React registers its listeners: nobody listens for loop boundaries, so the
            compositor keeps every infinite animation off the main thread (lib/design/quiet-loops.ts) */}
        <script dangerouslySetInnerHTML={{ __html: QUIET_LOOPS }} />
        {/* the desk's sheet and its theme: a hard load must not flash the phone's tokens first */}
        <script dangerouslySetInnerHTML={{ __html: DESK_SHEET_SCRIPT }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        {/* Chrome's install offer can come before hydration: kept for «Установить Pulse» (D-125) */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CATCHER }} />
        <QueryProvider>
          {children}
          <ToastHost />
          {/* the company's pass after a code sign-in plays over the screen that loads (D-135) */}
          <ArrivalLayer />
          {/* a company's day, not the developers' console (D-157) */}
          <NotOnOps>
            <OfflineBanner />
            {/* the phone knows whether it runs the server's build, and updates with one tap (D-115) */}
            <AppUpdate />
            <OutboxReplay />
            {/* a voice message, a photo or a report with a photo kept without network goes by itself (D-130) */}
            <MediaReplay />
            <MascotPower />
            {/* «вызови охрану!» reaches a secretary on any screen (D-99) */}
            <SecretaryAlarmGate />
            {/* a request to the secretary kept without network goes by itself (D-106) */}
            <ErrandReplay />
            {/* the push channel re-registers itself and the icon keeps its number (D-114) */}
            <PushSync />
            {/* a sign-in taken away (all devices, a fired person) lands on the sign-in screen (D-135) */}
            <SessionWatch />
          </NotOnOps>
          {/* every tap ticks — one listener, no button codes it (D-147) */}
          <TapHaptics />
        </QueryProvider>
      </body>
    </html>
  );
}
