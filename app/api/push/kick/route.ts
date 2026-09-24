import { after } from "next/server";

import { withAuth } from "@/lib/api/handler";
import { apiOk } from "@/lib/api/respond";
import { kickDeliveries } from "@/lib/push/send";

/**
 * «Отправь сейчас» for the mutations that do not pass an API route (D-114): a message in a
 * thread, the secretary's buttons, an answer to a meeting, a shop order — they write straight
 * through supabase-js, and their pushes used to wait for the minute sweep. Any signed-in person
 * may kick: the worker claims its rows, so an extra kick sends nothing twice.
 */
export const POST = withAuth("any", async () => {
  after(() => kickDeliveries());
  return apiOk({ ok: true }, 202);
});
