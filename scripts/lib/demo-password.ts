/**
 * The passwords of the dev demo accounts. They are not in the repository: the repository is
 * public and the dev base holds live data, so a password written here would be anybody's way in.
 * They live in .env.local (git-ignored): SMOKE_DIRECTOR_PASSWORD for the owner's test director
 * `test@demo.local`, SMOKE_PASSWORD for every other demo account. A local base made from
 * supabase/seed.sql keeps the seed's passwords — put those two values into .env.local there.
 * A missing variable stops the smoke with its name; the password itself is never printed.
 */
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

export const DIRECTOR_EMAIL = "test@demo.local";

export function demoPassword(email?: string): string {
  const name = email === DIRECTOR_EMAIL ? "SMOKE_DIRECTOR_PASSWORD" : "SMOKE_PASSWORD";
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing in .env.local — the demo passwords are not kept in the repository`);
  return value;
}
