import type { Metadata, Viewport } from "next";
import { Golos_Text, Manrope } from "next/font/google";

import { MascotPower } from "@/components/brand/MascotPower";
import { OfflineBanner } from "@/components/OfflineBanner";
import { OutboxReplay } from "@/components/OutboxReplay";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SecretaryAlarmGate } from "@/components/secretary/SecretaryAlarm";
import { loadBrand } from "@/lib/brand";
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
      <body className="min-h-dvh bg-bg text-text antialiased">
        <QueryProvider>
          {children}
          <ToastHost />
          <OfflineBanner />
          <OutboxReplay />
          <MascotPower />
          {/* «вызови охрану!» reaches a secretary on any screen (D-99) */}
          <SecretaryAlarmGate />
        </QueryProvider>
      </body>
    </html>
  );
}
