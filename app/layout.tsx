import type { Metadata, Viewport } from "next";

import { QueryProvider } from "@/components/providers/QueryProvider";
import { ToastHost } from "@/components/ui/Toast";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulse",
  description: "Голосовое управление компанией",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className="min-h-dvh bg-bg text-text antialiased">
        <QueryProvider>
          {children}
          <ToastHost />
        </QueryProvider>
      </body>
    </html>
  );
}
