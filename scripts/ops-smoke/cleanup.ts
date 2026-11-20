/** The company's activity wiped, then the company exported and deleted with its people and files. */
import { createHash } from "node:crypto";

import { record } from "../lib/smoke";

import { call, code, count, drain, RUN, seedActivity, seedFile, sql, why, type OpsCtx } from "./shared";

export async function checkCleanup(ctx: OpsCtx) {
  const { operator, service } = ctx;
  const companyId = ctx.companyId;
  if (!companyId) throw new Error("no company to clean up");

  const footprint = await call(operator, `/api/ops/companies/${companyId}/footprint`);
  const voiceFiles = (footprint.body.files as { voice: { count: number } }).voice.count;
  record("предпросмотр чистки считает файлы", voiceFiles === 1, JSON.stringify(footprint.body.files));
  const wrongName = await call(operator, `/api/ops/companies/${companyId}/wipe`, { body: { confirm_name: "не то", ...why() } });
  record("чистка с неверным названием: отказ", code(wrongName) === "confirm_mismatch", String(wrongName.status));
  const wiped = await call(operator, `/api/ops/companies/${companyId}/wipe`, { body: { confirm_name: RUN.companyName, ...why() } });
  record("чистка прошла", wiped.status === 200, JSON.stringify(wiped.body).slice(0, 160));
  const activityGone = (await count(ctx, "tasks", "company_id", companyId)) === 0 && (await count(ctx, "task_messages", "company_id", companyId)) === 0;
  record("дела и сообщения стёрты", activityGone);
  const peopleStay = (await count(ctx, "profiles", "company_id", companyId)) >= 4 && (await count(ctx, "shop_items", "company_id", companyId)) === 4;
  record("люди и витрина на месте", peopleStay);
  record("файл снят", (await drain(operator)) === 0);
  const voiceGone = await service.storage.from("voice").download(ctx.voicePath);
  record("файла в бакете больше нет", Boolean(voiceGone.error));

  await seedActivity(ctx, companyId, ctx.thirdId, ctx.thirdId, `${RUN.secretTitle} третья`);
  await seedFile(ctx, "voice", companyId, ctx.thirdId);

  const noExport = await call(operator, `/api/ops/companies/${companyId}/purge`, { body: { confirm_name: RUN.companyName, ...why() } });
  record("удаление без выгрузки: отказ", code(noExport) === "export_required", String(noExport.status));

  const exportStart = await call(operator, `/api/ops/companies/${companyId}/export`, { body: why() });
  const exportId = exportStart.body.export_id as string;
  const tables = (exportStart.body.tables ?? []) as string[];
  record("выгрузка началась", exportStart.status === 200 || exportStart.status === 201, `${tables.length} таблиц`);
  const counts: Record<string, number> = {};
  for (const table of tables) {
    let offset = 0;
    counts[table] = 0;
    for (;;) {
      const part = await call(operator, `/api/ops/exports/${exportId}/page?table=${table}&offset=${offset}`);
      if (part.status !== 200) throw new Error(`export page ${table}: ${part.status} ${JSON.stringify(part.body).slice(0, 120)}`);
      const rowsHere = part.body.rows as unknown[];
      counts[table] += rowsHere.length;
      offset += rowsHere.length;
      if (part.body.done) break;
    }
  }
  record("таблицы выгружены", (counts.tasks ?? 0) === 1 && (counts.profiles ?? 0) >= 4, `задач ${counts.tasks}, людей ${counts.profiles}`);
  record("заметки и доски не выгружаются", !tables.includes("notes") && !tables.includes("mind_boards"));
  const files = await call(operator, `/api/ops/exports/${exportId}/files?offset=0`);
  const listed = (files.body.files ?? []) as { url: string }[];
  const fetched = listed.length ? await fetch(listed[0].url) : null;
  record("файл выгрузки скачивается", listed.length === 1 && fetched?.ok === true, `${listed.length} файл`);
  const manifest = createHash("sha256").update(JSON.stringify(counts)).digest("hex");
  const finished = await call(operator, `/api/ops/exports/${exportId}/finish`, { body: { sha256: manifest, counts } });
  record("выгрузка завершена", finished.status === 200, String(finished.status));

  const purged = await call(operator, `/api/ops/companies/${companyId}/purge`, { body: { confirm_name: RUN.companyName, ...why() } });
  record("компания удалена", purged.status === 200, JSON.stringify(purged.body).slice(0, 160));
  record("файлы сняты", (await drain(operator)) === 0);
  record("строки компании нет", (await count(ctx, "companies", "id", companyId)) === 0);
  const leftovers = await sql(`select count(*) n from public.profiles where company_id = '${companyId}'`);
  record("людей нет", leftovers.text.includes('"n":0'), leftovers.text);
  const { data: gone } = await service.auth.admin.getUserById(ctx.director);
  record("входы людей удалены", !gone?.user);
  record("карточка больше не открывается", (await call(operator, `/api/ops/companies/${companyId}`)).status === 404);
  ctx.deletedCompany = companyId;
  ctx.companyId = null;
}
