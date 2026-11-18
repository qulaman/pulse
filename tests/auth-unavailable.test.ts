import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/** What the fake base answers: the claims, then the profile read. */
const base = vi.hoisted(() => ({
  claims: { data: { claims: { sub: "u1" } }, error: null } as { data: unknown; error: unknown },
  profile: { data: null, error: null } as { data: unknown; error: unknown },
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getClaims: async () => base.claims },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => base.profile }) }) }),
  }),
}));

const { AuthError, getSessionProfile } = await import("@/lib/auth");
const { GET } = await import("@/app/api/me/route");

const ACTIVE = { id: "u1", company_id: "c1", role: "tv", is_active: true, full_name: "Экран" };

async function failure(): Promise<InstanceType<typeof AuthError>> {
  try {
    await getSessionProfile();
  } catch (error) {
    if (error instanceof AuthError) return error;
    throw error;
  }
  throw new Error("expected AuthError");
}

describe("a failed profile read is not a lost sign-in (D-182)", () => {
  beforeEach(() => {
    base.claims = { data: { claims: { sub: "u1" } }, error: null };
    base.profile = { data: ACTIVE, error: null };
  });

  it("reads the profile when the base answers", async () => {
    await expect(getSessionProfile()).resolves.toMatchObject({ userId: "u1", companyId: "c1", role: "tv" });
  });

  it("says 503 when the base fails the read", async () => {
    base.profile = { data: null, error: { message: "fetch failed" } };
    expect(await failure()).toMatchObject({ status: 503, code: "unavailable" });
  });

  it("keeps 401 for no profile and no session, 403 for a switched-off one", async () => {
    base.profile = { data: null, error: null };
    expect(await failure()).toMatchObject({ status: 401 });
    base.claims = { data: null, error: { message: "no session" } };
    expect(await failure()).toMatchObject({ status: 401 });
    base.claims = { data: { claims: { sub: "u1" } }, error: null };
    base.profile = { data: { ...ACTIVE, is_active: false }, error: null };
    expect(await failure()).toMatchObject({ status: 403, code: "inactive" });
  });

  it("/api/me answers 503 with a time to ask again", async () => {
    base.profile = { data: null, error: { message: "fetch failed" } };
    const res = await GET(new Request("http://localhost/api/me"));
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(await res.json()).toEqual({ error: { code: "unavailable", message_ru: "Сервер не отвечает. Попробуйте через минуту" } });
  });

  it("/api/me still answers 401 to no sign-in", async () => {
    base.profile = { data: null, error: null };
    const res = await GET(new Request("http://localhost/api/me"));
    expect(res.status).toBe(401);
    expect(res.headers.get("retry-after")).toBeNull();
  });
});
