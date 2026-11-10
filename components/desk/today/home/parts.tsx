"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { LoadNote } from "@/components/desk/tasks/LoadState";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import type { LoadState } from "@/lib/desk/tasks";

/*
 * The pattern of the right column of «Сегодня» (TodayParts: Aside, Quiet, DAY_ROW, BlockLink),
 * repeated here for the home's blocks (D-164): a label with its way on, rows under a rule of ink.
 */

/** A line of the right column: the time or the figure in the margin, the words on one vertical. */
export const DAY_ROW = "grid grid-cols-[84px_minmax(0,1fr)] items-baseline gap-x-3 py-[7px] text-[13px] leading-5";

/** The same, with a short figure on the right end: «3 из 9», «+50». */
export const DAY_ROW_END = "grid grid-cols-[84px_minmax(0,1fr)_auto] items-baseline gap-x-3 py-[7px] text-[13px] leading-5";

export function Aside({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <section className="flex flex-col gap-1" data-testid={testId}>
      {children}
    </section>
  );
}

export function Quiet({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <p className="py-[7px] text-[13px] leading-5 text-muted" data-testid={testId}>
      {children}
    </p>
  );
}

/** A way from a block's head to the screen that holds all of it. */
export function BlockLink({ href, children, testId }: { href: string; children: ReactNode; testId?: string }) {
  return (
    <Link href={href} prefetch className="text-[13px] leading-4 text-muted transition-colors hover:text-text" data-testid={testId}>
      {children}
    </Link>
  );
}

/**
 * A move in a block's head, a word and not a button on the sheet: in the pen when it starts the
 * director's own move («Объявить»), quiet as the links beside it otherwise.
 */
export function HeadMove({
  children,
  onPress,
  pen = false,
  disabled = false,
  title,
  testId,
}: {
  children: ReactNode;
  onPress: () => void;
  pen?: boolean;
  disabled?: boolean;
  title?: string;
  testId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      title={title}
      className={`desk-focus text-[13px] leading-4 underline-offset-2 transition-colors hover:underline disabled:opacity-50 ${pen ? "font-medium text-accent" : "text-muted hover:text-text"}`}
      data-testid={testId}
    >
      {children}
    </button>
  );
}

/** The block while its data lands: rows of the block's own height, so nothing moves when it does. */
export function RowsBone({ rows, height = 35, wide = "78%" }: { rows: number; height?: number; wide?: string }) {
  return (
    <SkeletonGroup className="desk-list">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="grid grid-cols-[84px_minmax(0,1fr)] items-center gap-x-3" style={{ height }}>
          <Bone h={12} w={44} />
          <Bone h={14} w={wide} />
        </div>
      ))}
    </SkeletonGroup>
  );
}

/** A block's quiet line when its data did not come (or is an old copy), with «Повторить». */
export function BlockNote({ state, failed, onRetry, now }: { state: LoadState; failed: string; onRetry: () => void; now: Date }) {
  return <LoadNote state={state} failed={failed} onRetry={onRetry} now={now} className="py-[7px]" />;
}
