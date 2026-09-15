/**
 * Seed a client instance from its questionnaire (docs/SETUP.md §5, step 3; V-02).
 *   pnpm seed:client scripts/client.example.json [--dry-run] [--undo]
 *
 * Target = the Supabase project in .env.local (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY) — point .env.local at the client's fresh project first.
 * Idempotent: an existing auth user (by email) or company (by name) is reused, profiles
 * are upserted, so a failed run is simply re-run. `--undo` removes exactly what the
 * questionnaire describes (profiles, auth users, the company) — for a retry from zero.
 * Passwords not given in the file are generated and printed ONCE; nothing is written
 * to disk.
 */
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { suggestAliases } from "../lib/people/aliases";
import { CompanySettingsSchema, SettingsPatchSchema } from "../lib/settings";

const ROLES = ["director", "manager", "employee", "shopkeeper"] as const;

const PersonSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  email: z.email(),
  password: z.string().min(6).max(72).optional(),
  role: z.enum(ROLES).default("employee"),
  position: z.string().trim().max(120).optional(),
  aliases: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  manager_email: z.email().optional(),
});

const QuestionnaireSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
  company_name: z.string().trim().min(2).max(120),
  settings: SettingsPatchSchema.optional(),
  director: PersonSchema.omit({ role: true, manager_email: true }),
  tv: z.object({ email: z.email(), password: z.string().min(6).max(72).optional() }).optional(),
  employees: z.array(PersonSchema).max(500).default([]),
});

type Questionnaire = z.infer<typeof QuestionnaireSchema>;
type Plan = { email: string; full_name: string; role: string; position: string | null; aliases: string[]; manager_email?: string; password?: string };

function parseArgs(argv: string[]) {
  const file = argv.find((a) => !a.startsWith("--"));
  return { file, dryRun: argv.includes("--dry-run"), undo: argv.includes("--undo") };
}

function password(): string {
  // 12 chars from an unambiguous alphabet: said aloud once, then changed in the app.
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(12);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

/** People in questionnaire order; aliases suggested against everyone before them (D-54). */
function plan(q: Questionnaire): Plan[] {
  const people: Plan[] = [];
  const seen: { full_name: string; aliases: string[] }[] = [];
  const add = (p: Omit<Plan, "aliases"> & { aliases?: string[] }) => {
    const suggestion = suggestAliases(p.full_name, seen);
    const aliases = p.aliases?.length ? p.aliases : suggestion.mine;
    for (const other of suggestion.forOthers) {
      const row = people.find((x) => x.full_name === other.full_name);
      if (row && !row.aliases.includes(other.alias)) row.aliases.push(other.alias);
    }
    const row = { ...p, aliases };
    people.push(row);
    seen.push({ full_name: p.full_name, aliases });
  };
  add({ ...q.director, role: "director", position: q.director.position ?? "Директор" });
  for (const e of q.employees) add({ ...e, position: e.position ?? null });
  if (q.tv) people.push({ email: q.tv.email, full_name: "TV Kiosk", role: "tv", position: null, aliases: [], password: q.tv.password });
  return people;
}

async function findUserId(supabase: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function seed(supabase: SupabaseClient, q: Questionnaire, people: Plan[], dryRun: boolean): Promise<void> {
  const settings = CompanySettingsSchema.parse(q.settings ?? {});

  // One instance = one company (V-02): reuse by name, refuse a second one.
  const companies = await supabase.from("companies").select("id, name");
  if (companies.error) throw new Error(`companies read failed: ${companies.error.message}`);
  const existing = companies.data?.find((c) => c.name === q.company_name);
  const foreign = companies.data?.filter((c) => c.name !== q.company_name) ?? [];
  if (foreign.length && !process.env.SEED_CLIENT_ALLOW_MULTI) {
    throw new Error(
      `в инстансе уже есть другая компания (${foreign.map((c) => c.name).join(", ")}) — изолированный инстанс на клиента (V-02). ` +
        `Для пробного прогона на dev: SEED_CLIENT_ALLOW_MULTI=1`,
    );
  }
  console.log(`компания: ${existing ? `есть (${existing.id})` : "создать"} — «${q.company_name}»`);
  console.log(`люди: ${people.length} (директор, ${q.employees.length} сотрудников${q.tv ? ", киоск" : ""})`);
  for (const p of people) console.log(`  ${p.role.padEnd(10)} ${p.full_name.padEnd(28)} ${p.email.padEnd(30)} алиасы: ${p.aliases.join(", ") || "—"}`);
  if (dryRun) return;

  let companyId = existing?.id;
  if (!companyId) {
    const inserted = await supabase.from("companies").insert({ name: q.company_name, settings }).select("id").single();
    if (inserted.error) throw new Error(`company insert failed: ${inserted.error.message}`);
    companyId = inserted.data.id;
  } else {
    const updated = await supabase.from("companies").update({ settings }).eq("id", companyId);
    if (updated.error) throw new Error(`company settings update failed: ${updated.error.message}`);
  }

  const ids = new Map<string, string>();
  const generated: { email: string; password: string }[] = [];
  for (const p of people) {
    let id = await findUserId(supabase, p.email);
    if (!id) {
      const pwd = p.password ?? password();
      const created = await supabase.auth.admin.createUser({
        email: p.email,
        password: pwd,
        email_confirm: true,
        user_metadata: { full_name: p.full_name },
      });
      if (created.error || !created.data.user) throw new Error(`createUser ${p.email} failed: ${created.error?.message}`);
      id = created.data.user.id;
      if (!p.password) generated.push({ email: p.email, password: pwd });
    }
    ids.set(p.email, id);
  }

  for (const p of people) {
    const upserted = await supabase.from("profiles").upsert(
      {
        id: ids.get(p.email)!,
        company_id: companyId,
        full_name: p.full_name,
        role: p.role as (typeof ROLES)[number] | "tv",
        position: p.position,
        aliases: p.aliases,
        manager_id: p.manager_email ? (ids.get(p.manager_email) ?? null) : null,
        availability: "active",
        is_active: true,
      },
      { onConflict: "id" },
    );
    if (upserted.error) throw new Error(`profile ${p.email} failed: ${upserted.error.message}`);
  }

  console.log(`\nготово: company ${companyId}, профилей ${people.length}`);
  if (generated.length) {
    console.log("сгенерированные пароли — передать лично, в приложении их сменят (больше нигде не сохранены):");
    for (const g of generated) console.log(`  ${g.email}  ${g.password}`);
  }
}

async function undo(supabase: SupabaseClient, q: Questionnaire, people: Plan[]): Promise<void> {
  const ids: string[] = [];
  for (const p of people) {
    const id = await findUserId(supabase, p.email);
    if (id) ids.push(id);
  }
  // manager_id points inside the same set: unlink first, then delete in any order.
  if (ids.length) {
    const unlinked = await supabase.from("profiles").update({ manager_id: null }).in("id", ids);
    if (unlinked.error) throw new Error(`manager unlink failed: ${unlinked.error.message}`);
  }
  for (const p of people) {
    const id = await findUserId(supabase, p.email);
    if (!id) continue;
    const profile = await supabase.from("profiles").delete().eq("id", id);
    if (profile.error) throw new Error(`profile delete ${p.email} failed: ${profile.error.message}`);
    const user = await supabase.auth.admin.deleteUser(id);
    if (user.error) throw new Error(`deleteUser ${p.email} failed: ${user.error.message}`);
    console.log(`удалён ${p.email}`);
  }
  const company = await supabase.from("companies").delete().eq("name", q.company_name);
  if (company.error) throw new Error(`company delete failed: ${company.error.message}`);
  console.log(`удалена компания «${q.company_name}»`);
}

async function main(): Promise<void> {
  const { file, dryRun, undo: doUndo } = parseArgs(process.argv.slice(2));
  if (!file) {
    console.error("использование: pnpm seed:client <анкета.json> [--dry-run] [--undo]");
    process.exit(2);
  }
  const envFile = resolve(".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY не заданы — .env.local должен смотреть на проект клиента");
    process.exit(2);
  }

  const parsed = QuestionnaireSchema.safeParse(JSON.parse(readFileSync(resolve(file), "utf8")));
  if (!parsed.success) {
    console.error("анкета не прошла проверку:");
    for (const issue of parsed.error.issues) console.error(`  ${issue.path.join(".") || "(корень)"}: ${issue.message}`);
    process.exit(2);
  }
  const q = parsed.data;
  const emails = new Set<string>();
  for (const p of [q.director, ...q.employees, ...(q.tv ? [q.tv] : [])]) {
    if (emails.has(p.email.toLowerCase())) {
      console.error(`почта повторяется: ${p.email}`);
      process.exit(2);
    }
    emails.add(p.email.toLowerCase());
  }
  for (const e of q.employees) {
    if (e.manager_email && !emails.has(e.manager_email.toLowerCase())) {
      console.error(`${e.email}: руководитель ${e.manager_email} не в анкете`);
      process.exit(2);
    }
  }

  console.log(`инстанс: ${url}${dryRun ? "  (dry-run: ничего не пишу)" : ""}`);
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const people = plan(q);
  if (doUndo) await undo(supabase, q, people);
  else await seed(supabase, q, people, dryRun);
}

// exitCode, not exit(): on Windows an immediate exit trips libuv while the HTTP keep-alive closes.
main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
