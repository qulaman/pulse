"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";

import BoardPage from "@/app/(director)/notes/b/[id]/page";

import { DeskBoard } from "./DeskBoard";

/**
 * A board on the right of «Заметки» (D-153, wave 3): the desk's own outline (`DeskBoard`) — typed
 * and moved with the keyboard and the mouse. `?view=phone` keeps the phone's board screen as it
 * is, for what only it has: the dictaphone and «Раздать поручения» — its data glue, the sketch
 * pad and «на стену» included, in a column up to 900 px, without the phone's tab-bar room and
 * «‹ Заметки» (the list of boards stands on the left).
 */
export function BoardDetail() {
  const params = useSearchParams();
  const { id } = useParams<{ id: string }>();
  if (params.get("view") !== "phone") return <DeskBoard />;
  return (
    <div
      className="mx-auto w-full max-w-[900px] px-2 pb-8 pt-1 [&_.max-w-lg]:max-w-none [&>main]:pb-6 [&_[data-testid=board-back]]:invisible"
      data-testid="desk-board-phone"
    >
      <p className="mx-4 mt-3 flex items-center justify-between gap-3 rounded-[10px] border border-border/70 bg-surface/50 px-3 py-2 text-[13px] leading-[18px] text-muted">
        Телефонный вид доски — диктофон и раздача поручений
        <Link href={`/desk/notes/b/${id}`} className="shrink-0 font-semibold text-accent hover:underline">
          К настольному виду ›
        </Link>
      </p>
      <BoardPage />
    </div>
  );
}
