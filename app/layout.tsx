import type { Metadata, Viewport } from "next";

import { QueryProvider } from "@/components/providers/QueryProvider";
import { loadBrand } from "@/lib/brand";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

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
    <html lang="ru" style={brand.customAccent ? ({ "--accent": brand.accent } as React.CSSProperties) : undefined}>
      <body className="min-h-dvh bg-bg text-text antialiased">
        <QueryProvider>
          {children}
          <ToastHost />
        </QueryProvider>
      </body>
    </html>
  );
}
