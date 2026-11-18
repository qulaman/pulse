"use client";

import { useRealtimeQuery } from "@/lib/realtime/useRealtimeQuery";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { receiptLine, type DeliveryRow, type Receipt } from "@/lib/tasks/receipts";

import type { CalendarEvent } from "./queries";

/**
 * Did the invitation reach them (принцип 8, D-180): the receipts of one meeting, read only while it
 * is open in the desk's side — never for a list. The rows are the outbox's own: the trigger queues
 * an `event_invite` for each person put on the list and an `event_moved` for a move or a new place,
 * each pointing at `/calendar?e=<id>`. The words are the tasks' (`receiptLine`): «отправлю в 08:00»,
 * «не открывал с 9:14», «увидел 9:20», «уведомления не включены» — never «не получил».
 *
 * Only a director reads them: RLS gives a person their own rows and a director the company's, so
 * anybody else would read their own receipt and take it for the others'.
 */

/** The kinds of the outbox that tell a person about a meeting. */
const KINDS = ["event_invite", "event_moved"] as const;

/** What the receipt of one person says, and about which notice. */
export type MeetingReceipt = Receipt & { moved?: true };

const NO_INVITE: MeetingReceipt = { text: "без приглашения", tone: "muted" };

export const meetingReceiptKeys = (eventId: string) => ["meeting-receipts", eventId] as const;

/**
 * The receipt of each person by id. Pure — the clock comes in, so the wording is tested.
 * - Somebody who still owes an answer: the newest notice they were sent.
 * - Somebody who answered: nothing (the answer is the receipt), unless a «Перенос» came after the
 *   answer — then whether they saw the move.
 * - The author and those who refused: nothing.
 * - Nobody sent anything: a meeting of a series puts its people on the list without a notice
 *   (D-148) — «без приглашения»; any other meeting has nothing honest to say.
 * Rows older than the meeting's own row are another meeting's (an id is never reused, but the URL
 * filter is a string: the bound is cheap insurance).
 */
export function meetingReceipts(
  rows: readonly Pick<DeliveryRow, "user_id" | "event_kind" | "status" | "created_at" | "sent_at" | "seen_at" | "acted_at" | "deliver_after" | "last_error">[],
  event: Pick<CalendarEvent, "author_id" | "created_at" | "recurrence_rule_id" | "participants">,
  now: Date,
): Map<string, MeetingReceipt> {
  const since = new Date(event.created_at).getTime();
  const newest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!(KINDS as readonly string[]).includes(row.event_kind)) continue;
    if (new Date(row.created_at).getTime() < since) continue;
    const was = newest.get(row.user_id);
    if (!was || row.created_at > was.created_at) newest.set(row.user_id, row);
  }

  const out = new Map<string, MeetingReceipt>();
  for (const person of event.participants) {
    if (person.user_id === event.author_id || person.status === "declined") continue;
    const row = newest.get(person.user_id) ?? null;
    if (person.status === "invited") {
      const line = receiptLine(row as DeliveryRow | null, now);
      if (line) out.set(person.user_id, row?.event_kind === "event_moved" ? { ...line, moved: true } : line);
      else if (!row && event.recurrence_rule_id) out.set(person.user_id, NO_INVITE);
      continue;
    }
    // answered: only a move they have not answered since is news
    if (row?.event_kind !== "event_moved") continue;
    if (person.responded_at && new Date(person.responded_at).getTime() >= new Date(row.created_at).getTime()) continue;
    const line = receiptLine(row as DeliveryRow, now);
    if (line) out.set(person.user_id, { ...line, moved: true });
  }
  return out;
}

/**
 * The notices of one open meeting, live: a change of any meeting notice takes a fresh read (one
 * small query by the meeting's URL). `enabled` — a director with a meeting open.
 */
export function useMeetingReceipts(event: Pick<CalendarEvent, "id" | "created_at"> | null, enabled: boolean) {
  const id = event?.id ?? "";
  return useRealtimeQuery<DeliveryRow[], DeliveryRow>({
    queryKey: meetingReceiptKeys(id),
    queryFn: async () => {
      const supabase = createBrowserSupabase();
      const { data, error } = await supabase
        .from("notification_deliveries")
        .select("*")
        .in("event_kind", [...KINDS])
        .eq("meta->>url", `/calendar?e=${id}`)
        .gte("created_at", event?.created_at ?? new Date(0).toISOString())
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as DeliveryRow[];
    },
    channel: { table: "notification_deliveries", filter: `event_kind=in.(${KINDS.join(",")})` },
    enabled: enabled && Boolean(event),
  });
}
