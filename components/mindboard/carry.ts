"use client";

import type { QueryClient } from "@tanstack/react-query";

import { toast } from "@/components/ui/Toast";
import { boardSummary, nextTitle, openPoints } from "@/lib/mindboard/list";
import { boardFailure, copyBoard } from "@/lib/mindboard/mutations";
import { hasContent } from "@/lib/mindboard/sketch";
import type { MindBoard } from "@/lib/mindboard/queries";
import type { Note } from "@/lib/notes/queries";
import { pluralRu } from "@/lib/tasks/status-text";

type Me = { userId: string; companyId: string };

/** A toast with «Отменить» or «Открыть» waits this long: the hand is still on the phone. */
const OFFER_MS = 8_000;

/** Copies on their way, by their key: a second tap on the same offer waits for the first. */
const copying = new Set<string>();

/**
 * «Новая доска из этой» (D-140): the open points of the board on a new one, named for today,
 * and a toast that opens it. A plain call — a toast's button may outlive the screen. `key` is
 * the offer's own idempotency key: the same offer tapped twice is one board (`mind_board_copy`
 * hands the landed one back), and a tap while it is on its way does nothing.
 */
export async function carryOver(
  queryClient: QueryClient,
  me: Me | undefined,
  board: Pick<MindBoard, "id" | "title">,
  open: (id: string) => void,
  key: string = crypto.randomUUID(),
): Promise<void> {
  if (copying.has(key)) return;
  copying.add(key);
  const title = nextTitle(board.title, new Date());
  try {
    const row = await copyBoard(queryClient, me, { source: board.id, id: crypto.randomUUID(), title, client_request_id: key });
    toast(`Новая доска «${row.title}»`, { action: { label: "Открыть", onClick: () => open(row.id) }, lifetimeMs: OFFER_MS });
  } catch (error) {
    boardFailure(error);
  } finally {
    copying.delete(key);
  }
}

/**
 * The board leaves the wall (D-140): what the meeting got through, and — while points are
 * still open — the way to carry them to the next one in one tap: «Убрана со стены ·
 * отмечено 3 из 5» with «2 → в новую доску».
 */
export function ejectReceipt(
  queryClient: QueryClient,
  me: Me | undefined,
  board: Pick<MindBoard, "id" | "title"> | null,
  rows: readonly Note[],
  open: (id: string) => void,
): void {
  const summary = boardSummary(rows.filter((row) => row.board_id === board?.id && row.deleted_at === null && hasContent(row)));
  const done = summary.total > 0 ? ` · отмечено ${summary.done} из ${summary.total}` : "";
  const left = board ? openPoints(rows.filter((row) => row.board_id === board.id)).length : 0;
  if (!board || left === 0) {
    toast(`Доска убрана со стены${done}`);
    return;
  }
  // one key for the offer: however many taps, one new board
  const key = crypto.randomUUID();
  toast(`Доска убрана со стены${done}`, {
    action: { label: `${left} → в новую доску`, onClick: () => void carryOver(queryClient, me, board, open, key) },
    lifetimeMs: OFFER_MS,
  });
}

/** «3 открытых пункта» — what «Новая доска из этой» would take. */
export function openWords(count: number): string {
  return `${count} ${pluralRu(count, ["открытый пункт", "открытых пункта", "открытых пунктов"])}`;
}
