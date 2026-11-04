import { apiError, apiOk } from "@/lib/api/respond";
import { STARTER_SHOP } from "@/lib/company/starter";
import { createAuthUser, issueOpsCodeSoftly, removeAuthUsers } from "@/lib/ops/accounts";
import { CreateCompanyBodySchema, type CompaniesAnswer, type CreateCompanyAnswer } from "@/lib/ops/contract";
import { opsRpc } from "@/lib/ops/db";
import { withOps } from "@/lib/ops/handler";
import { startingSettings } from "@/lib/ops/settings";
import { suggestAliases } from "@/lib/people/aliases";
import type { Json } from "@/lib/supabase/types";

export const GET = withOps({ gate: "read" }, async ({ db }) =>
  apiOk({ companies: await opsRpc(db, "ops_companies", {}) } satisfies CompaniesAnswer),
);

/**
 * A new company with its director and its kiosk. Logins live outside the base's transaction, so
 * their ids are prepared by the base (`ops_prepare_company`): a repeat comes to the same people,
 * and a failed base call takes back the logins this very request made.
 */
export const POST = withOps(
  {
    schema: CreateCompanyBodySchema,
    action: "create_company",
    company: () => null,
    target: ({ body }) => ({
      name: body.name,
      slug: body.slug,
      parser: body.parser.provider,
      points_enabled: body.points_enabled,
    }),
    replay: (result) => ({ ...result, login: null }),
  },
  async ({ req, service, ticket, body }) => {
    const free = await opsRpc(service, "ops_slug_free", { p_slug: body.slug });
    if (!free) return apiError(409, "slug_taken", "Такой адрес уже занят");

    const { director_id: directorId, tv_id: tvId } = await opsRpc(service, "ops_prepare_company", { p_ticket: ticket });

    const made: string[] = [];
    let companyId: string;
    try {
      for (const person of [
        { id: directorId, email: body.director.email, fullName: body.director.full_name },
        { id: tvId, fullName: "TV Kiosk" },
      ]) {
        const user = await createAuthUser(service, person);
        if (user.created) made.push(user.id);
      }
      const created = await opsRpc(service, "ops_create_company", {
        p_ticket: ticket,
        p_payload: {
          name: body.name,
          slug: body.slug,
          settings: startingSettings(body.parser.provider, body.points_enabled),
          director: {
            full_name: body.director.full_name,
            position: body.director.position ?? "Директор",
            aliases: suggestAliases(body.director.full_name, []).mine,
          },
          shop: STARTER_SHOP,
        } as Json,
      });
      companyId = created.company_id as string;
    } catch (error) {
      await removeAuthUsers(service, made);
      throw error;
    }

    // the company stands: a code that failed comes from the card
    const login = await issueOpsCodeSoftly(service, req, {
      userId: directorId,
      name: body.director.full_name,
      company: { name: body.name, slug: body.slug },
      requestId: body.client_request_id,
    });
    return apiOk(
      {
        company_id: companyId,
        director_id: directorId,
        tv_id: tvId,
        slug: body.slug,
        duplicate: false,
        login,
      } satisfies CreateCompanyAnswer,
      201,
    );
  },
);
