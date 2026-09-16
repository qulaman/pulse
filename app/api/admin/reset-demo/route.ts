import { z } from "zod";

import { describeReset, resetCompanyDemo } from "@/lib/admin/reset-demo";
import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { createServiceSupabase } from "@/lib/supabase/service";

const BodySchema = z.strictObject({
  /** The word the director typed in the sheet — a second, deliberate step. */
  confirm: z.literal("ОБНУЛИТЬ"),
});

/**
 * «Обнулить демо-базу»: the company's activity starts from zero, people and settings
 * stay. Two locks: the director role, and DEMO_RESET_ENABLED=1 on this instance —
 * a client's production never sets it, so the button cannot exist there (V-02).
 */
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ profile }) => {
    if (process.env.DEMO_RESET_ENABLED !== "1") {
      return apiError(403, "demo_reset_disabled", "На этом инстансе обнуление выключено");
    }
    const report = await resetCompanyDemo(createServiceSupabase(), profile.companyId);
    return apiOk({ report, message_ru: describeReset(report) });
  },
  BodySchema,
);
