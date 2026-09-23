"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Mascot } from "@/components/brand/Mascot";
import { IngestOverlay } from "@/components/voice/IngestOverlay";
import { VoiceButton } from "@/components/voice/VoiceButton";
import { usePointsEnabled } from "@/lib/points/queries";
import { isCountable, useIngestStore } from "@/lib/store/ingest";

/**
 * The director's input, present on every screen of the group (docs/FRONTEND.md "FAB").
 * On /confirm the button steps aside — that screen is about the phrase already spoken.
 * A parsed but unsent batch is a draft: it waits in a pill instead of dragging the
 * director back to /confirm on every navigation.
 */
export function DirectorFab() {
  const pathname = usePathname();
  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const reset = useIngestStore((state) => state.reset);

  // /confirm is about the phrase already spoken; /pulse hosts the button inline and
  // the assistant mentions the draft itself
  const onConfirm = pathname === "/confirm" || pathname === "/pulse";
  // «Заметки» carries its own microphone that writes notes verbatim (D-81): one mic per screen
  const ownMic = pathname === "/notes";
  const draft = stage === "confirm" && !onConfirm;
  const pointsEnabled = usePointsEnabled().data === true;
  const count = entities.filter((entity) => isCountable(entity, pointsEnabled)).length;

  return (
    <>
      {onConfirm ? null : draft ? (
        <div
          className="fixed inset-x-0 z-30 flex justify-center px-4"
          style={{ bottom: "calc(72px + env(safe-area-inset-bottom))" }}
        >
          <div
            className="flex items-center gap-3 rounded-full border border-border bg-surface py-2 pl-2 pr-2"
            style={{ boxShadow: "var(--shadow-raised)" }}
          >
            <Mascot state="thinking" size={32} />
            <Link href="/confirm" className="text-[14px] font-medium leading-[18px]">
              Черновик: {count} {count === 1 ? "сущность" : count < 5 ? "сущности" : "сущностей"} · открыть
            </Link>
            <button
              type="button"
              aria-label="Сбросить черновик"
              onClick={reset}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-[16px] text-muted"
            >
              ×
            </button>
          </div>
        </div>
      ) : ownMic ? null : (
        <VoiceButton />
      )}
      {/* on Пульс the face on the screen plays the pipeline itself; the overlay would be a
          second mascot over the first (D-60, fifth refinement) — errors still need it */}
      <IngestOverlay progress={pathname !== "/pulse"} />
    </>
  );
}
