import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";
import { loadTvPhotos } from "@/lib/tv/photosServer";

/**
 * Report photos for the wall (D-185): `GET /api/tv/photos` — the round's recent photos of done
 * tasks; `?employee_id=` — the reports of the person on the wall; `?task_id=` — the photos of the
 * one order on the wall (the kiosk gets these only for what its own wall row shows). The kiosk's role reads neither
 * tasks nor storage, so the photos are picked under the service role, bound to the caller's
 * company on every query (`lib/tv/photosServer.ts`), and come back as links signed for an hour.
 */
export const GET = withAuth(["tv", "director"], async ({ req, profile }) => {
  const params = new URL(req.url).searchParams;
  const taskId = params.get("task_id");
  const employeeId = params.get("employee_id");
  if ((taskId !== null && !z.uuid().safeParse(taskId).success) || (employeeId !== null && !z.uuid().safeParse(employeeId).success)) {
    return apiError(400, "validation_error", "Неверный запрос");
  }
  const role = profile.role === "tv" ? "tv" : "director";
  const photos = await loadTvPhotos(createServiceSupabase(), profile.companyId, { taskId, employeeId, role });
  // signed links are the caller's alone: never cached on the way
  return Response.json({ photos }, { headers: { "Cache-Control": "private, no-store" } });
});
