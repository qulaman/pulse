/** A throw-away company with its director: made once (a replay makes nothing), the director signs in by its code. */
import { record } from "../lib/smoke";

import { call, code, count, RUN, why, type OpsCtx } from "./shared";

export async function checkCompany(ctx: OpsCtx) {
  const { operator } = ctx;
  const form = {
    name: RUN.companyName,
    slug: RUN.slug,
    director: { full_name: "Директор Смоуков", position: "Директор" },
    parser: { provider: "deepseek" },
    points_enabled: true,
  };
  const firstWrite = why();
  const made = await call(operator, "/api/ops/companies", { body: { ...form, ...firstWrite } });
  record("компания создана", made.status === 200 || made.status === 201, JSON.stringify(made.body).slice(0, 160));
  const companyId = made.body.company_id as string;
  ctx.companyId = companyId;
  ctx.director = made.body.director_id as string;
  const issued = made.body.login as { code?: string; link?: string } | null;
  const directorLogin = /^\d{8}$/.test(issued?.code ?? "") && (issued?.link ?? "").endsWith(`/c/${RUN.slug}`);
  record("директор получил код и ссылку", directorLogin, issued?.link ?? "");

  const replay = await call(operator, "/api/ops/companies", { body: { ...form, ...firstWrite } });
  record("повтор запроса: та же компания, кода нет", replay.body.company_id === companyId && replay.body.login === null && replay.body.duplicate === true);
  const taken = await call(operator, "/api/ops/companies", { body: { ...form, ...why() } });
  record("занятый адрес: slug_taken", code(taken) === "slug_taken", String(taken.status));

  const card = await call(operator, `/api/ops/companies/${companyId}`);
  const roles = ((card.body.people ?? []) as { role: string }[]).map((person) => person.role).sort();
  record("в компании директор и киоск", roles.join() === "director,tv", roles.join());
  const shop = await count(ctx, "shop_items", "company_id", companyId);
  record("витрина заведена", shop === 4, String(shop));

  const redeemed = await call(ctx.directorJar, "/api/auth/code", { body: { code: issued?.code, client_request_id: crypto.randomUUID() } });
  record("директор вошёл по коду", redeemed.status === 200, JSON.stringify(redeemed.body).slice(0, 120));
  const directorMe = await call(ctx.directorJar, "/api/me");
  record("директор в своей компании", JSON.stringify(directorMe.body).includes(companyId), JSON.stringify(directorMe.body).slice(0, 120));
}
