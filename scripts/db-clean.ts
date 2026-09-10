/**
 * Demo-state cleanup for the dev project: drops every task, message, award, AI log,
 * draft and smoke-* login, keeps people and company settings.
 *   pnpm db:clean            — dev only; refuses to run against anything but the linked dev ref
 * `pnpm db:reset` restores the full seed (fixtures the pgTAP suite relies on).
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

process.loadEnvFile(".env.local");

const DEV_REF = "qobsbjugromdwfdodwwa";
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

if (!url.includes(DEV_REF)) {
  console.error(`refusing: NEXT_PUBLIC_SUPABASE_URL is not the dev project (${DEV_REF})`);
  process.exit(1);
}
if (!serviceKey) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is missing in .env.local");
  process.exit(1);
}

const linked = (() => {
  try {
    return readFileSync("supabase/.temp/project-ref", "utf8").trim();
  } catch {
    return "";
  }
})();
if (linked && linked !== DEV_REF) {
  console.error(`refusing: linked project ${linked} is not dev`);
  process.exit(1);
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const ALL = "00000000-0000-0000-0000-000000000000";

async function wipe(table: string, column = "id") {
  const { count, error } = await supabase.from(table).delete({ count: "exact" }).neq(column, ALL);
  if (error) throw new Error(`${table}: ${error.message}`);
  console.log(`  ${table.padEnd(20)} −${count ?? 0}`);
}

async function main() {
  console.log("wiping activity tables…");
  // children first — FKs without cascade
  await wipe("task_messages");
  await wipe("point_transactions");
  await wipe("announcement_acks", "announcement_id");
  await wipe("announcements");
  await wipe("tasks");
  await wipe("reminders");
  await wipe("recurrence_rules");
  await wipe("inbox_items");
  await wipe("ai_logs");
  await wipe("ingest_batches");

  console.log("voice objects…");
  const { data: companies } = await supabase.from("companies").select("id");
  for (const company of companies ?? []) {
    const { data: folders } = await supabase.storage.from("voice").list(company.id, { limit: 1000 });
    for (const folder of folders ?? []) {
      const { data: files } = await supabase.storage.from("voice").list(`${company.id}/${folder.name}`, { limit: 1000 });
      const paths = (files ?? []).map((f) => `${company.id}/${folder.name}/${f.name}`);
      if (paths.length) {
        const { error } = await supabase.storage.from("voice").remove(paths);
        if (error) console.warn(`  storage ${folder.name}: ${error.message}`);
        else console.log(`  storage ${folder.name.slice(0, 8)}… −${paths.length}`);
      }
    }
  }

  console.log("smoke logins…");
  let page = 1;
  let removed = 0;
  for (;;) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers: ${error.message}`);
    const smoke = data.users.filter((u) => /^smoke-.*@demo\.local$/i.test(u.email ?? ""));
    for (const user of smoke) {
      const { error: del } = await supabase.auth.admin.deleteUser(user.id);
      if (del) console.warn(`  ${user.email}: ${del.message}`);
      else removed += 1;
    }
    if (data.users.length < 200) break;
    page += 1;
  }
  console.log(`  auth users −${removed} (profiles cascade)`);

  const { count } = await supabase.from("profiles").select("id", { count: "exact", head: true });
  console.log(`done. people left: ${count ?? 0}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
