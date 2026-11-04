import "server-only";

import { CODE_TTL_SECONDS, generateCode } from "@/lib/login-code/code";
import { hashCode, signInLink } from "@/lib/login-code/server";
import { suggestAliases } from "@/lib/people/aliases";
import { syntheticEmail } from "@/lib/people/email";
import { loadRoster } from "@/lib/roster";

import type { IssuedCode } from "./contract";
import { opsRpc, type OpsClient } from "./db";
import { OpsRpcError } from "./guard";

/** Two random UUIDs: 72 characters, bcrypt's limit — a password no one has. */
function noPassword(): string {
  return `${globalThis.crypto.randomUUID()}${globalThis.crypto.randomUUID()}`;
}

/**
 * A login for a person of a company. Without an email the person gets a service address and signs
 * in with a code (D-135). `id` is prepared by the base for a company's first people: found already,
 * it is the earlier try of the same request and `created` stays false.
 */
export async function createAuthUser(
  service: OpsClient,
  person: { id?: string; email?: string; fullName: string },
): Promise<{ id: string; created: boolean }> {
  if (person.id) {
    const { data } = await service.auth.admin.getUserById(person.id);
    if (data.user) return { id: person.id, created: false };
  }
  const { data, error } = await service.auth.admin.createUser({
    ...(person.id ? { id: person.id } : {}),
    email: person.email ?? syntheticEmail(),
    password: noPassword(),
    email_confirm: true,
    user_metadata: { full_name: person.fullName },
  });
  if (error || !data.user) {
    if (error && /already|exists|registered/i.test(error.message)) throw new OpsRpcError("email_exists");
    console.error("ops createUser failed:", error?.message);
    throw new OpsRpcError("auth_failed");
  }
  return { id: data.user.id, created: true };
}

export async function removeAuthUsers(service: OpsClient, ids: string[]): Promise<void> {
  for (const id of ids) {
    const { error } = await service.auth.admin.deleteUser(id);
    if (error) console.error("ops rollback deleteUser failed:", error.message);
  }
}

/**
 * A person added to a company under a ticket: the login, then the profile; a refused profile takes
 * the login away again, so a retry with the same email is not an «already registered». A namesake
 * already on the roster gets the initial that now tells the two apart, as in POST /api/people.
 */
export async function addOpsPerson(
  service: OpsClient,
  input: { ticket: string; company: string; fullName: string; role: string; position?: string; email?: string },
): Promise<string> {
  const roster = await loadRoster(input.company);
  const suggestion = suggestAliases(input.fullName, roster);
  const { id } = await createAuthUser(service, { email: input.email, fullName: input.fullName });

  try {
    await opsRpc(service, "ops_add_person", {
      p_ticket: input.ticket,
      p_company: input.company,
      p_user: id,
      p_full_name: input.fullName,
      p_role: input.role,
      p_position: input.position ?? null,
      p_aliases: suggestion.mine,
    });
  } catch (error) {
    await removeAuthUsers(service, [id]);
    throw error;
  }

  for (const other of suggestion.forOthers) {
    const namesake = roster.find((person) => person.full_name === other.full_name);
    if (!namesake) continue;
    const updated = await service
      .from("profiles")
      .update({ aliases: [...namesake.aliases, other.alias] })
      .eq("id", namesake.id)
      .eq("company_id", input.company);
    if (updated.error) console.error("ops namesake alias update failed:", updated.error.message);
  }
  return id;
}

export async function loadCompany(service: OpsClient, id: string): Promise<{ name: string; slug: string | null }> {
  const { data, error } = await service.from("companies").select("name, slug").eq("id", id).maybeSingle();
  if (error) throw new Error(`company read failed: ${error.message}`);
  if (!data) throw new OpsRpcError("not_found");
  return data;
}

export async function loadPerson(
  service: OpsClient,
  company: string,
  id: string,
): Promise<{ full_name: string; is_active: boolean }> {
  const { data, error } = await service
    .from("profiles")
    .select("full_name, is_active")
    .eq("id", id)
    .eq("company_id", company)
    .maybeSingle();
  if (error) throw new Error(`person read failed: ${error.message}`);
  if (!data) throw new OpsRpcError("not_found");
  return data;
}

/**
 * The link of a code. It leads into the app: the console's own host serves nothing else (proxy.ts),
 * so a deployment with OPS_HOST names the app's address in OPS_APP_ORIGIN.
 */
function appLink(req: Request, slug: string | null): string {
  const origin = process.env.OPS_APP_ORIGIN?.replace(/\/+$/, "");
  if (!origin) return signInLink(req, slug);
  return slug ? `${origin}/c/${slug}` : `${origin}/login`;
}

/**
 * A sign-in code issued by nobody of the company (`p_issued_by` null): the journal says who. Eight
 * digits from 10^8: a clash with an open code is rare, a further draw settles it.
 */
export async function issueOpsCode(
  service: OpsClient,
  req: Request,
  input: { userId: string; name: string; company: { name: string; slug: string | null }; requestId: string },
): Promise<IssuedCode> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateCode();
    try {
      const issued = await opsRpc(service, "issue_login_code", {
        p_user_id: input.userId,
        p_issued_by: null,
        p_code_hash: hashCode(code),
        p_ttl_seconds: CODE_TTL_SECONDS,
        p_request_id: input.requestId,
      });
      return {
        code,
        expires_at: issued.expires_at,
        link: appLink(req, input.company.slug),
        company: input.company.name,
        name: input.name,
      };
    } catch (error) {
      if (error instanceof OpsRpcError && error.message === "collision") continue;
      throw error;
    }
  }
  console.error("ops issue_login_code: five collisions in a row");
  throw new OpsRpcError("issue_failed");
}

/** After a change that already happened: no code is no failure, a new one comes from the card. */
export async function issueOpsCodeSoftly(...args: Parameters<typeof issueOpsCode>): Promise<IssuedCode | null> {
  return issueOpsCode(...args).catch((error: unknown) => {
    console.error("ops login code failed:", error instanceof Error ? error.message : error);
    return null;
  });
}
