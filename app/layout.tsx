import type { Metadata, Viewport } from "next";
import { Golos_Text, Manrope } from "next/font/google";

import { AppUpdate } from "@/components/AppUpdate";
import { MascotPower } from "@/components/brand/MascotPower";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OutboxReplay } from "@/components/OutboxReplay";
import { MediaReplay } from "@/components/MediaReplay";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { PushSync } from "@/components/push/PushSync";
import { SecretaryAlarmGate } from "@/components/secretary/SecretaryAlarm";
import { ErrandReplay } from "@/components/secretary/ErrandReplay";
import { loadBrand } from "@/lib/brand";
import { QUIET_LOOPS } from "@/lib/design/quiet-loops";
import { INSTALL_CATCHER } from "@/lib/push/install-catcher";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

// Self-hosted at build time (no runtime request, works offline): Manrope for headings and
// numbers, Golos Text for running Cyrillic text (D-50).
const display = Manrope({ subsets: ["cyrillic", "latin"], weight: ["600", "700", "800"], variable: "--font-display", display: "swap" });
const body = Golos_Text({ subsets: ["cyrillic", "latin"], weight: ["400", "500", "600"], variable: "--font-body", display: "swap" });

export const metadata: Metadata = {
  title: "Pulse",
  description: "Голосовое управление компанией",
  applicationName: "Pulse",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  // iOS home-screen install: own window, dark status bar (no serwist yet — D-40 PWA core is next)
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
      className={`${display.variable} ${body.variable}`}
      style={brand.customAccent ? ({ "--accent": brand.accent } as React.CSSProperties) : undefined}
    >
      <head>
        {/* before React registers its listeners: nobody listens for loop boundaries, so the
            compositor keeps every infinite animation off the main thread (lib/design/quiet-loops.ts) */}
        <script dangerouslySetInnerHTML={{ __html: QUIET_LOOPS }} />
      </head>
      <body className="min-h-dvh bg-bg text-text antialiased">
        {/* Chrome's install offer can come before hydration: kept for «Установить Pulse» (D-125) */}
        <script dangerouslySetInnerHTML={{ __html: INSTALL_CATCHER }} />
        <QueryProvider>
          {children}
          <ToastHost />
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
        </QueryProvider>
      </body>
    </html>
  );
}
