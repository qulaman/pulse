/**
 * What the console smoke's parts share (scripts/smoke-ops.ts, D-157): the run's names, the service
 * role, a browser's cookies without a browser, the console's API, a TOTP of the operator's app, and
 * the context the parts hand on to each other — the throw-away operator, company and people.
 */
import { createHash, createHmac, randomBytes } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";

import { APP_URL, loadEnv, serviceClient } from "../lib/smoke";

export const DEV_REF = "qobsbjugromdwfdodwwa";

const env = loadEnv(["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
if (!env.NEXT_PUBLIC_SUPABASE_URL.includes(DEV_REF)) {
  console.error(`refusing: NEXT_PUBLIC_SUPABASE_URL is not the dev project (${DEV_REF})`);
  process.exit(1);
}

const stamp = Date.now().toString(36);
/** The run's own names: nothing of anybody else carries them. */
export const RUN = {
  stamp,
  operatorEmail: `smoke-ops-${stamp}@demo.local`,
  strangerEmail: `smoke-stranger-${stamp}@demo.local`,
  password: randomBytes(24).toString("base64url"),
  secretTitle: `Секретная задача смоука ${stamp}`,
  companyName: `Смоук консоли ${stamp}`,
  slug: `ops-smoke-${stamp}`,
};

/** A browser's cookies, without a browser. */
export class Jar {
  readonly cookies = new Map<string, string>();
  raw: string[] = [];

  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  take(response: Response): void {
    for (const line of response.headers.getSetCookie()) {
      this.raw.push(line);
      const [pair] = line.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      if (value === "" || /max-age=0/i.test(line)) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
}

/**
 * What the parts hand on: the pilot and how it looked before, the operator's cookies, his TOTP
 * secret, the throw-away company (null once it is gone) and its people, the auth users to delete.
 */
export type OpsCtx = {
  service: SupabaseClient;
  operator: Jar;
  pilot: string;
  pilotBefore: string;
  created: string[];
  operatorId: string;
  secret: string;
  companyId: string | null;
  deletedCompany: string;
  director: string;
  directorJar: Jar;
  employee: string;
  taskId: string;
  voicePath: string;
  thirdId: string;
};

export function newContext(): OpsCtx {
  return {
    service: serviceClient(),
    operator: new Jar(),
    pilot: "",
    pilotBefore: "",
    created: [],
    operatorId: "",
    secret: "",
    companyId: null,
    deletedCompany: "",
    director: "",
    directorJar: new Jar(),
    employee: "",
    taskId: "",
    voicePath: "",
    thirdId: "",
  };
}

export type Answer = { status: number; body: Record<string, unknown> };

export async function call(jar: Jar, path: string, init: { method?: string; body?: unknown; origin?: string | null } = {}): Promise<Answer> {
  const method = init.method ?? (init.body === undefined ? "GET" : "POST");
  const origin = init.origin === undefined ? APP_URL : init.origin;
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    redirect: "manual",
    headers: {
      ...(init.body === undefined ? {} : { "content-type": "application/json" }),
      ...(method !== "GET" && origin ? { origin } : {}),
      ...(jar.cookies.size ? { cookie: jar.header() } : {}),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  jar.take(response);
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  return { status: response.status, body };
}

export const code = (answer: Answer) => (answer.body.error as { code?: string } | undefined)?.code;
/** Every write of the console names its reason and its request. */
export const why = () => ({ reason: "живая проверка консоли", client_request_id: crypto.randomUUID() });

function base32(secret: string): Buffer {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const bytes: number[] = [];
  for (let at = 0; at + 8 <= bits.length; at += 8) bytes.push(parseInt(bits.slice(at, at + 8), 2));
  return Buffer.from(bytes);
}

/** The six digits the operator's app shows now. */
export function totp(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const digest = createHmac("sha1", base32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

/** The next 30-second window: a code is good once per window. */
export async function nextWindow(): Promise<void> {
  await new Promise((done) => setTimeout(done, 30_000 - (Date.now() % 30_000) + 500));
}

/** SQL on dev through the Management API (SUPABASE_ACCESS_TOKEN): what the API itself cannot reach. */
export async function sql(query: string): Promise<{ status: number; text: string }> {
  const response = await fetch(`https://api.supabase.com/v1/projects/${DEV_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN ?? ""}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  return { status: response.status, text: await response.text() };
}

export async function count(ctx: OpsCtx, table: string, column: string, value: string): Promise<number> {
  const { count: found, error } = await ctx.service.from(table).select("*", { count: "exact", head: true }).eq(column, value);
  if (error) throw new Error(`${table}: ${error.message}`);
  return found ?? 0;
}

/** The pilot's rows by table, as one line: it must read the same after the run. */
export async function pilotCounts(ctx: OpsCtx): Promise<string> {
  const tables = ["profiles", "tasks", "task_messages", "point_transactions", "notes", "ai_logs", "shop_items"];
  return (await Promise.all(tables.map((table) => count(ctx, table, "company_id", ctx.pilot)))).join("/");
}

/** Takes the files of wiped and deleted companies out of storage; 0 — none left. */
export async function drain(jar: Jar): Promise<number> {
  for (let round = 0; round < 10; round++) {
    const answer = await call(jar, "/api/ops/storage/drain", { method: "POST" });
    if (answer.status !== 200) throw new Error(`drain ${answer.status}`);
    if (answer.body.left === 0) return 0;
  }
  return -1;
}

export async function seedFile(ctx: OpsCtx, bucket: string, company: string, user: string): Promise<string> {
  const path = `${company}/${user}/${crypto.randomUUID()}.webm`;
  const { error } = await ctx.service.storage.from(bucket).upload(path, new Blob([randomBytes(64)], { type: "audio/webm" }));
  if (error) throw new Error(`upload ${bucket}: ${error.message}`);
  return path;
}

/** A task with a message, and a note: the activity a wipe must take away. */
export async function seedActivity(ctx: OpsCtx, company: string, author: string, assignee: string, title: string): Promise<string> {
  const task = await ctx.service.from("tasks").insert({ company_id: company, author_id: author, assignee_id: assignee, title, status: "sent" }).select("id").single();
  if (task.error) throw new Error(`task: ${task.error.message}`);
  const message = await ctx.service.from("task_messages").insert({ company_id: company, task_id: task.data.id, sender_id: author, type: "text", content: "сообщение смоука" });
  if (message.error) throw new Error(`message: ${message.error.message}`);
  const note = await ctx.service.from("notes").insert({ company_id: company, user_id: author, text: "заметка смоука" });
  if (note.error) throw new Error(`note: ${note.error.message}`);
  return task.data.id as string;
}

/** A run that broke off leaves its company: the console removes it the way it removes any. */
export async function removeCompany(jar: Jar, id: string, name: string): Promise<boolean> {
  const started = await call(jar, `/api/ops/companies/${id}/export`, { body: why() });
  const exportId = started.body.export_id as string | undefined;
  if (!exportId) return false;
  const sha256 = createHash("sha256").update(id).digest("hex");
  await call(jar, `/api/ops/exports/${exportId}/finish`, { body: { sha256, counts: {} } });
  const purged = await call(jar, `/api/ops/companies/${id}/purge`, { body: { confirm_name: name, ...why() } });
  if (purged.status !== 200) return false;
  await drain(jar);
  return true;
}
