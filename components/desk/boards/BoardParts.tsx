"use client";

import { useEffect, useRef, useState } from "react";

import { Kbd } from "@/components/desk/ui/Kbd";
import { DeskPage } from "@/components/desk/ui/PageTitle";
import { Bone, SkeletonGroup } from "@/components/ui/Skeleton";
import { cleanTitle } from "@/lib/mindboard/list";

/** A desk board while its data come: the head and the two columns (D-122). */
export function BoardBones() {
  return (
    <DeskPage width="full">
      <SkeletonGroup className="board-page" grow>
        <Bone w={64} h={14} />
        <Bone className="mt-3" w="40%" h={34} />
        <Bone className="mt-2" w="24%" h={16} />
        <div className="board-body mt-5">
          <span className="block h-[360px] rounded-[14px] bg-surface-2" />
          <span className="block aspect-video rounded-[14px] bg-surface-2" />
        </div>
      </SkeletonGroup>
    </DeskPage>
  );
}

/** The keys of the outline, one quiet line under it. */
export function BoardKeys() {
  return (
    <p className="board-keys mt-2 flex items-center gap-x-3 overflow-hidden whitespace-nowrap text-[12px] leading-4 text-muted">
      <span className="inline-flex items-center gap-1">
        <Kbd>Enter</Kbd> строка
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Tab</Kbd> подпункт
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>V</Kbd> голосом
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>Ctrl Enter</Kbd> отметить
      </span>
      <span className="inline-flex items-center gap-1">
        <Kbd>?</Kbd> все клавиши
      </span>
    </p>
  );
}

/** The title in place: Enter or leaving keeps it, Esc gives the old one back, an empty field keeps the old. */
export function TitleField({ title, onDone, onCancel }: { title: string; onDone: (title: string) => void; onCancel: () => void }) {
  const [draft, setDraft] = useState(title);
  const field = useRef<HTMLInputElement>(null);
  // Enter, Esc and the blur that follows them answer once
  const answered = useRef(false);
  const finish = (next: string | null) => {
    if (answered.current) return;
    answered.current = true;
    if (next === null) onCancel();
    else onDone(next);
  };
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  return (
    <input
      ref={field}
      value={draft}
      maxLength={120}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => finish(cleanTitle(draft, title))}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(cleanTitle(draft, title));
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          finish(null);
        }
      }}
      aria-label="Название доски"
      data-testid="desk-board-title-input"
      className="board-title w-full bg-transparent shadow-[inset_0_-2px_0_var(--accent)] outline-none"
    />
  );
}
