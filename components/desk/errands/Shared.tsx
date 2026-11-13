"use client";

import { CloudOff } from "lucide-react";

import { InPanel } from "@/components/desk/ui/DeskPanel";
import { Button } from "@/components/ui/Button";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { useErrand, type Errand } from "@/lib/errands/queries";
import type { SecretaryAction } from "@/lib/settings";

import { writeParams } from "../tasks/flow";
import { ErrandDetails } from "./ErrandCard";
import { ErrandsHero } from "./Hero";

export const NO_ACTIONS: SecretaryAction[] = [];
export const NO_ERRANDS: Errand[] = [];

/** The requests did not come: the total says so in words, never «всё спокойно» over nothing. */
export function LoadFailedHero({ busy, onRetry }: { busy: boolean; onRetry: () => void }) {
  return (
    <ErrandsHero
      tone="warn"
      lead={
        <span className="errands-figure-tile" data-tone="warn">
          <CloudOff size={24} strokeWidth={2.25} aria-hidden />
        </span>
      }
      title="Заявки не загрузились"
      sub="Проверьте связь — экран обновится сам, как только она будет"
      aside={
        <Button size="sm" variant="secondary" loading={busy} onClick={onRetry} data-testid="desk-errands-retry">
          Повторить
        </Button>
      }
    />
  );
}

/* ---- the panel --------------------------------------------------------------------------- */

/**
 * `?e=<id>` in the right-hand panel — where the push about a request leads (via /secretary). A
 * request the screen's list does not hold is read by its id, whatever its age.
 */
export function ErrandPanel({
  rows,
  openId,
  viewer,
  meId,
  now,
  catalogue,
  pointsOn,
}: {
  rows: readonly Errand[];
  openId: string | null;
  viewer: "director" | "secretary";
  meId: string;
  now: Date;
  catalogue: readonly SecretaryAction[];
  pointsOn: boolean;
}) {
  const inList = openId ? rows.find((e) => e.id === openId) : undefined;
  const one = useErrand(openId, !inList);
  const errand = inList ?? one.errand;
  if (!openId) return null;
  return (
    <InPanel panelKey={`errand:${openId}`} onClose={() => writeParams({ e: null })}>
      {errand ? (
        <ErrandDetails errand={errand} viewer={viewer} meId={meId} now={now} catalogue={catalogue} pointsOn={pointsOn} />
      ) : one.isLoading ? (
        <SkeletonGroup>
          <Bone h={24} w="70%" />
          <Bone h={120} className="mt-4" />
        </SkeletonGroup>
      ) : (
        <p className="pr-8 text-[14px] leading-5 text-muted">Заявка не найдена.</p>
      )}
    </InPanel>
  );
}
