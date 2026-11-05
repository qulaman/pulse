"use client";

import { EmptyState } from "@/components/desk/ui/EmptyState";
import { DeskPage, PageTitle } from "@/components/desk/ui/PageTitle";
import { Button } from "@/components/ui/Button";
import { staleNote, type LoadState } from "@/lib/desk/tasks";

/**
 * What a screen says when its data did not come: nothing to show is said as a failure with
 * «Повторить», never as an empty list or a green «всё закрыто»; a copy that could not be refreshed
 * stays on screen with a quiet note. The states come from `loadStateOf` (lib/desk/tasks.ts).
 */

/** Nothing to show: what did not load, why as far as is known, and «Повторить». `what` — accusative: «задачи». */
export function LoadFailure({ what, offline, busy, onRetry }: { what: string; offline: boolean; busy: boolean; onRetry: () => void }) {
  return (
    <div data-testid="desk-load-failed">
      <EmptyState
        title={`Не смог загрузить ${what}`}
        hint={offline ? "Нет связи, а копии на этом компьютере нет. Загружу сам, как только связь появится" : "Это сбой загрузки: что на самом деле в работе, отсюда не видно"}
        action={
          <Button size="sm" variant="secondary" loading={busy} onClick={onRetry} data-testid="desk-load-retry">
            Повторить
          </Button>
        }
      />
    </div>
  );
}

/** A whole screen with nothing to show: its title and the failure. */
export function FailedScreen({ title, what, offline, busy, onRetry }: { title: string; what: string; offline: boolean; busy: boolean; onRetry: () => void }) {
  return (
    <DeskPage>
      <PageTitle title={title} />
      <LoadFailure what={what} offline={offline} busy={busy} onRetry={onRetry} />
    </DeskPage>
  );
}

/**
 * One quiet line in place of a part of a screen, or over a copy: `failed` is said while there is
 * nothing to show (a whole phrase: «Встречи не загрузились»), the time of the missed refresh while
 * there is a copy, and nothing at all when the data is fine.
 */
export function LoadNote({ state, failed, onRetry, now, className = "" }: { state: LoadState; failed: string; onRetry: () => void; now?: Date; className?: string }) {
  if (state.kind !== "failed" && state.kind !== "stale") return null;
  const note = state.kind === "stale" ? staleNote(state, now) : { text: failed };
  return (
    <p className={`text-[13px] leading-[18px] ${state.kind === "failed" ? "text-danger" : "text-muted"} ${className}`} title={note.title} data-testid="desk-load-note" data-load={state.kind}>
      {note.text}
      {" · "}
      <button type="button" onClick={onRetry} className="text-accent underline-offset-2 hover:underline focus-visible:underline focus-visible:outline-none" data-testid="desk-load-note-retry">
        Повторить
      </button>
    </p>
  );
}
