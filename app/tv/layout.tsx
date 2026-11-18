import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthError, getSessionProfile, homeForRole } from "@/lib/auth";

export const metadata: Metadata = { title: "Пульс — ТВ" };

/**
 * Киоск: собственный layout без шапки, таб-бара и голосовой кнопки — на стене нечего
 * нажимать (docs/FRONTEND.md «ТВ-режим»). Вход — auth-пользователь роли `tv`; директор
 * пускается тоже, чтобы посмотреть экран со своего ноутбука, не логинясь в киоск.
 * Курсор спрятан: мышь к мини-ПК подключена только на время настройки.
 */
export default async function TvLayout({ children }: { children: React.ReactNode }) {
  let profile;
  try {
    profile = await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) redirect("/login");
    throw error;
  }
  if (profile.role !== "tv" && profile.role !== "director") redirect(homeForRole(profile.role));

  return (
    <div className="h-dvh overflow-hidden bg-bg" style={{ cursor: "none" }}>
      {children}
    </div>
  );
}
