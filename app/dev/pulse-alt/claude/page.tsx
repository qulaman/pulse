import type { Metadata, Viewport } from "next";

import { STATES, type StateId } from "@/app/dev/pulse-alt/fixtures";

import { sans, serif } from "./fonts";
import { PulseTalk } from "./PulseTalk";

export const metadata: Metadata = { title: "Пульс — Разговор" };

// the status bar takes the paper's colour in both themes
export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F5" },
    { media: "(prefers-color-scheme: dark)", color: "#262624" },
  ],
};

type Search = Record<string, string | string[] | undefined>;

export default async function Page({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const raw = typeof params.state === "string" ? params.state : "idle";
  const state: StateId = STATES.some((s) => s.id === raw) ? (raw as StateId) : "idle";
  const fail = typeof params.fail === "string" ? params.fail : null;
  const away = params.away === "1";
  return (
    <div className={`${serif.variable} ${sans.variable}`}>
      <PulseTalk key={`${state}:${fail ?? ""}:${away}`} initial={state} fail={fail} away={away} />
    </div>
  );
}
