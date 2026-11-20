/**
 * Developers' console smoke (D-157, tasks/029), through the API of a running app on the dev base:
 * a throw-away operator signs in with a real TOTP, creates a throw-away company, runs every
 * write on it, wipes it, exports it, deletes it, and checks that the pilot did not move.
 * Requires the migration 20261104130000 on the base and a running app on APP_URL
 * (default http://localhost:3000). Refuses anything but the dev project. The journal keeps the
 * run's lines: it is append-only.
 *   pnpm smoke:ops
 */
import { finish, recordError } from "./lib/smoke";
import { checkCleanup } from "./ops-smoke/cleanup";
import { checkCompany } from "./ops-smoke/company";
import { checkDoor } from "./ops-smoke/door";
import { checkEdits } from "./ops-smoke/edits";
import { checkJournal } from "./ops-smoke/journal";
import { newContext, pilotCounts, removeCompany, RUN } from "./ops-smoke/shared";
import { checkSignIn } from "./ops-smoke/signin";

async function main(): Promise<void> {
  const ctx = newContext();
  const { data: pilots, error: pilotsError } = await ctx.service.from("companies").select("id, name").order("created_at").limit(1);
  if (pilotsError || !pilots?.length) throw new Error("no pilot company");
  ctx.pilot = pilots[0].id as string;
  ctx.pilotBefore = await pilotCounts(ctx);

  try {
    // one after another: each part hands the next what it made (the operator, the company, its people)
    for (const check of [checkDoor, checkSignIn, checkCompany, checkEdits, checkCleanup, checkJournal]) await check(ctx);
  } catch (error) {
    recordError("smoke:ops", error);
  } finally {
    if (ctx.companyId && !(await removeCompany(ctx.operator, ctx.companyId, RUN.companyName).catch(() => false))) {
      console.log(`\nОСТАЛАСЬ тестовая компания ${ctx.companyId} (${RUN.companyName}): удалить из консоли`);
    }
    for (const id of new Set(ctx.created)) await ctx.service.auth.admin.deleteUser(id).catch(() => undefined);
  }
}

main()
  .catch((error: unknown) => recordError("smoke:ops", error))
  .finally(() => finish());
