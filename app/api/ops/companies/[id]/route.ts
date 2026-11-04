import { apiOk } from "@/lib/api/respond";
import { todayYmd } from "@/lib/datetime/calendar";
import { UpdateCompanyBodySchema, type CompanyCard, type UpdateCompanyAnswer } from "@/lib/ops/contract";
import { opsRpc, priceSpend } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";
import { mergeSettingsPatch } from "@/lib/ops/settings";
import { loadCompanySettings } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

export const GET = withOps({ gate: "read" }, async ({ db, params }) => {
  const card = await opsRpc(db, "ops_company_card", { p_company: params.id });
  return apiOk({ ...card, spend_30d: card.spend_30d.map(priceSpend) } satisfies CompanyCard);
});

export const PATCH = withOps(
  {
    schema: UpdateCompanyBodySchema,
    action: "update_company",
    company: ({ params }) => params.id,
    target: ({ body }) => ({
      name: body.name ?? null,
      slug: body.slug ?? null,
      settings: (body.settings ?? null) as Json,
      dev_tools: body.dev_tools ?? null,
    }),
    replay: () => ({ ok: true }),
  },
  async ({ service, ticket, body, params }) => {
    const merged = body.settings
      ? (mergeSettingsPatch(parseCompanySettings(await loadCompanySettings(params.id)), body.settings, todayYmd()) as Record<string, Json>)
      : null;
    // the strict patch schema refuses the key on purpose: a company cannot open it for itself
    const settings: Json | null =
      merged || body.dev_tools !== undefined
        ? { ...merged, ...(body.dev_tools === undefined ? {} : { dev_tools: body.dev_tools }) }
        : null;
    await opsRpc(service, "ops_update_company", {
      p_ticket: ticket,
      p_company: params.id,
      p_name: body.name ?? null,
      p_slug: body.slug ?? null,
      p_settings: settings,
    });
    return apiOk({ ok: true, duplicate: false } satisfies UpdateCompanyAnswer);
  },
);
