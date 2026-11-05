import type { Metadata, Viewport } from "next";
import { Golos_Text, IBM_Plex_Mono, IBM_Plex_Sans, IBM_Plex_Sans_Condensed, Manrope } from "next/font/google";

import { AppUpdate } from "@/components/AppUpdate";
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
import { loadBrand } from "@/lib/brand";
import { DESK_SHEET_SCRIPT } from "@/lib/desk/device";
import { QUIET_LOOPS } from "@/lib/design/quiet-loops";
import { INSTALL_CATCHER } from "@/lib/push/install-catcher";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

// Self-hosted at build time (no runtime request, works offline): Manrope for headings and
// numbers, Golos Text for running Cyrillic text (D-50).
const display = Manrope({ subsets: ["cyrillic", "latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Golos_Text({ subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

// The desk's three voices (D-158). `preload: false`: only a page that sets them in type fetches a
// file, so a phone never does. Condensed has no Russian letters on Google Fonts: it speaks in
// figures, and Russian words in its place fall back to Plex Sans.
const plexSans = IBM_Plex_Sans({ subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"], variable: "--font-plex-sans", display: "swap", preload: false });
const plexCond = IBM_Plex_Sans_Condensed({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-plex-cond", display: "swap", preload: false });
const plexMono = IBM_Plex_Mono({ subsets: ["cyrillic", "latin"], weight: ["400", "500"], variable: "--font-plex-mono", display: "swap", preload: false });

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
  // the client accent (contrast-checked) overrides the token for the whole instance
  const brand = await loadBrand();
  return (
    <html
      lang="ru"
      className={`${display.variable} ${body.variable} ${plexSans.variable} ${plexCond.variable} ${plexMono.variable}`}
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
