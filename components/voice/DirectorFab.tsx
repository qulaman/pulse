"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { IngestOverlay } from "@/components/voice/IngestOverlay";
import { TextSheet } from "@/components/voice/TextSheet";
import { usePointsEnabled } from "@/lib/points/queries";
import { useComposeStore } from "@/lib/store/compose";
import { isCountable, useIngestStore } from "@/lib/store/ingest";

/**
 * What the director's screens share around the input (docs/FRONTEND.md "FAB"). The floating
 * microphone is gone (D-92): the director speaks to the face on Пульс, and only there. What
 * stays on the other screens: a parsed but unsent batch waits in a draft pill instead of
 * dragging the director back on every navigation; the typed input opens on request
 * («Дать задачу» on a person's card, D-84); the overlay shows a pipeline that is still running
 * or has failed.
 */
export function DirectorFab() {
  const pathname = usePathname();
  const stage = useIngestStore((state) => state.stage);
  const entities = useIngestStore((state) => state.entities);
  const reset = useIngestStore((state) => state.reset);

  // /confirm is about the phrase already spoken; on /pulse the face is the input and the
  // assistant mentions the draft itself
  const onConfirm = pathname === "/confirm" || pathname === "/pulse";
  // «Заметки» writes notes verbatim and never asks for an order (D-81)
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
        <ComposeSheet />
      )}
      {/* on Пульс the face on the screen plays the pipeline itself; the overlay would be a
          second mascot over the first (D-60, fifth refinement) — errors still need it */}
      <IngestOverlay progress={pathname !== "/pulse"} />
    </>
  );
}

/**
 * The typed input with no button of its own: it opens when a screen asks for it — «Дать
 * задачу» on a person's card, with the person pinned by id (D-84). On Пульс the face listens
 * for the same request, so this one is not mounted there.
 */
function ComposeSheet() {
  const [open, setOpen] = useState(false);
  useEffect(
    () =>
      useComposeStore.subscribe((state, previous) => {
        if (state.requestId !== previous.requestId) setOpen(true);
      }),
    [],
  );
  return <TextSheet open={open} onClose={() => setOpen(false)} />;
}
