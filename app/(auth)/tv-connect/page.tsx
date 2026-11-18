import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthError, getSessionProfile } from "@/lib/auth";

import { TvConnect } from "./TvConnect";

export const metadata: Metadata = { title: "Pulse — подключение экрана" };

/**
 * «Подключить экран» on the TV's side (D-182): open without a session (proxy.ts), it shows a code
 * the director types on the remote. A wall that already has its kiosk session goes straight to
 * `/tv`; anyone else — nobody, a person, a switched-off kiosk — sees the code: confirming it makes
 * this browser the wall of the director's company. It never says which companies exist (D-134).
 */
export default async function TvConnectPage() {
  let role: string | null = null;
  try {
    role = (await getSessionProfile()).role;
  } catch (error) {
    if (!(error instanceof AuthError)) throw error;
  }
  if (role === "tv") redirect("/tv");
  return <TvConnect />;
}
