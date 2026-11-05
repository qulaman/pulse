import type { QueryClient } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Health } from "@/lib/push/health";

import { findWithoutLogin, LOGIN_PROBE, scanLogins } from "./launch-queries";

/** The query cache out of the way: every read is a request the test can count. */
const client = { fetchQuery: ({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn() } as unknown as QueryClient;

type Who = { email?: string | null; signed?: string | null; code?: string; fails?: boolean };

/** What the two routes of a person's card answer, by the person's id. */
function server(people: Record<string, Who>) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const match = /\/api\/people\/([^/]+)\/(login-code|login)$/.exec(url);
      if (!match) throw new Error(url);
      const [, id, route] = match;
      if (route === "login") asked.push(id);
      const who = people[id] ?? {};
      if (who.fails) return new Response("{}", { status: 502 });
      const body = route === "login" ? { email: who.email ?? null, last_sign_in_at: who.signed ?? null } : { state: who.code ?? "none" };
      return new Response(JSON.stringify(body), { status: 200 });
    }),
  );
  return asked;
}

const team = (...ids: string[]) => ids.map((id) => ({ id }));
const device = (...ids: string[]) => new Map<string, Health>(ids.map((id) => [id, { state: "ok", text: "работают" }]));

afterEach(() => vi.unstubAllGlobals());

describe("scanLogins", () => {
  it("stops as soon as it knows both answers", async () => {
    const asked = server({ a: { code: "used" } });
    expect(await scanLogins(client, team("a", "b", "c", "d"), undefined)).toEqual({ anyLogin: true, nextPersonId: "b" });
    expect(asked).toEqual(["a", "b"]);
  });

  it("takes a device for a login without asking anybody about that person", async () => {
    const asked = server({});
    expect(await scanLogins(client, team("a", "b"), device("a"))).toEqual({ anyLogin: true, nextPersonId: "b" });
    expect(asked).toEqual(["b"]);
  });

  it("does not take a switched-off channel for a device", async () => {
    server({});
    const off = new Map<string, Health>([["a", { state: "off", text: "уведомления не включены" }]]);
    expect(await scanLogins(client, team("a"), off)).toEqual({ anyLogin: false, nextPersonId: "a" });
  });

  it("asks about a limited number of people, however large the team", async () => {
    const asked = server({});
    const many = Array.from({ length: LOGIN_PROBE + 40 }, (_, index) => ({ id: `p${index}` }));
    expect(await scanLogins(client, many, undefined)).toEqual({ anyLogin: false, nextPersonId: "p0" });
    expect(asked).toHaveLength(LOGIN_PROBE);
  });

  it("steps over a person who could not be read", async () => {
    server({ a: { fails: true }, b: { signed: "2026-11-01T10:00:00Z" } });
    expect(await scanLogins(client, team("a", "b", "c"), undefined)).toEqual({ anyLogin: true, nextPersonId: "c" });
  });

  it("does not take a service address for a password login", async () => {
    server({ a: { email: "p-1@people.invalid" } });
    expect(await scanLogins(client, team("a"), undefined)).toEqual({ anyLogin: false, nextPersonId: "a" });
  });
});

describe("findWithoutLogin", () => {
  it("goes on from the card and stops at the first one without a way in", async () => {
    const asked = server({ c: { code: "open" }, d: { signed: "2026-11-01T10:00:00Z" } });
    expect(await findWithoutLogin(client, team("a", "b", "c", "d", "e"), "b", undefined)).toEqual({ id: "e", unknown: 0 });
    expect(asked).toEqual(["c", "d", "e"]);
  });

  it("comes round to the top of the list", async () => {
    server({ c: { code: "used" } });
    expect(await findWithoutLogin(client, team("a", "b", "c"), "b", undefined)).toEqual({ id: "a", unknown: 0 });
  });

  it("never answers with the card it stands on", async () => {
    server({});
    expect(await findWithoutLogin(client, team("a"), "a", undefined)).toEqual({ id: null, unknown: 0 });
  });

  it("walks past those with a device without a request", async () => {
    const asked = server({});
    expect(await findWithoutLogin(client, team("a", "b", "c"), "a", device("b"))).toEqual({ id: "c", unknown: 0 });
    expect(asked).toEqual(["c"]);
  });

  it("says nobody only when everybody was read", async () => {
    server({ b: { signed: "2026-11-01T10:00:00Z" }, c: { email: "c@firm.kz" } });
    expect(await findWithoutLogin(client, team("a", "b", "c"), "a", undefined)).toEqual({ id: null, unknown: 0 });
  });

  it("counts whom it could not read, so «у всех есть вход» is not a guess", async () => {
    server({ b: { fails: true }, c: { signed: "2026-11-01T10:00:00Z" } });
    expect(await findWithoutLogin(client, team("a", "b", "c"), "a", undefined)).toEqual({ id: null, unknown: 1 });
  });

  it("takes a code that burned for no way in", async () => {
    server({ b: { code: "expired" } });
    expect(await findWithoutLogin(client, team("a", "b"), "a", undefined)).toEqual({ id: "b", unknown: 0 });
  });
});
