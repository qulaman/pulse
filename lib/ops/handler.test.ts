import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { OpsRpcError } from "./guard";

vi.mock("server-only", () => ({}));

const rpcAnswers = vi.hoisted(() => ({ next: new Map<string, unknown>() }));
const rpc = vi.hoisted(() => vi.fn());
const cookieClient = vi.hoisted(() => ({ rpc }));

vi.mock("./server", () => ({ createOpsSupabase: async () => cookieClient }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabase: () => ({ service: true }) }));

const { withOps } = await import("./handler");

const ID = "4f6e4c0e-3a1b-4c8e-9f7a-1b2c3d4e5f60";
const WRITE = { reason: "потому что надо", client_request_id: ID };
const Body = z.object({ reason: z.string(), client_request_id: z.string() });

function post(body: unknown = WRITE, headers: Record<string, string> = { host: "app.test", origin: "https://app.test" }) {
  return new Request("https://app.test/api/ops/x", { method: "POST", headers, body: JSON.stringify(body) });
}
function get(headers: Record<string, string> = { host: "app.test" }) {
  return new Request("https://app.test/api/ops/x", { headers });
}
const ctx = (params: Record<string, string> = {}) => ({ params: Promise.resolve(params) });

const reached = vi.fn(async () => Response.json({ reached: true }));
const action = withOps({ schema: Body, action: "update_company", company: () => ID, target: () => ({}) }, reached);
const gated = withOps({ gate: "operator" }, reached);

beforeEach(() => {
  rpcAnswers.next.clear();
  rpc.mockImplementation(async (name: string) => ({ data: rpcAnswers.next.get(name) ?? null, error: null }));
  reached.mockClear();
  rpc.mockClear();
});

afterEach(() => {
  delete process.env.OPS_HOST;
  vi.restoreAllMocks();
});

describe("withOps: the gates, in their order", () => {
  it("is 404 on a foreign host, before anything else", async () => {
    process.env.OPS_HOST = "ops.test";
    const response = await action(post());
    expect(response.status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a write without Origin and from another site", async () => {
    expect((await action(post(WRITE, { host: "app.test" }))).status).toBe(403);
    expect((await action(post(WRITE, { host: "app.test", origin: "https://evil.test" }))).status).toBe(403);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not ask an Origin of a read", async () => {
    rpcAnswers.next.set("ops_operators", []);
    expect((await gated(get())).status).toBe(200);
  });

  it("is 400 on a bad body, before a ticket", async () => {
    expect((await action(post({ reason: 1 }))).status).toBe(400);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("is 404 on an id that is no guid", async () => {
    expect((await gated(get(), ctx({ id: "42" }))).status).toBe(404);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("withOps: operator and ticket", () => {
  it("asks ops.assert for a route with no call of its own", async () => {
    rpcAnswers.next.set("ops_operators", []);
    await gated(get());
    expect(rpc).toHaveBeenCalledWith("ops_operators", {});
    expect(reached).toHaveBeenCalledOnce();
  });

  it("does not run the route when the base says no", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ops_denied", code: "P0001" } });
    const response = await gated(get());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ error: { code: "unauthorized" } });
    expect(reached).not.toHaveBeenCalled();
  });

  it("answers 428 when the code must be fresh", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "ops_fresh_required", code: "P0001" } });
    const response = await action(post());
    expect(response.status).toBe(428);
    expect(await response.json()).toMatchObject({ error: { code: "fresh_required" } });
  });

  it("hands the ticket to the route", async () => {
    rpcAnswers.next.set("ops_ticket", { ticket: "t-1" });
    await action(post());
    expect(rpc).toHaveBeenCalledWith("ops_ticket", {
      p_action: "update_company",
      p_company: ID,
      p_target: {},
      p_reason: WRITE.reason,
      p_client_request_id: ID,
    });
    expect(reached.mock.calls[0]).toEqual([expect.objectContaining({ ticket: "t-1", body: WRITE, service: { service: true } })]);
  });

  it("answers a repeat from the journal and never runs the route", async () => {
    rpcAnswers.next.set("ops_ticket", { duplicate: true, result: { balance: 7 } });
    const response = await action(post());
    expect(await response.json()).toEqual({ balance: 7, duplicate: true });
    expect(reached).not.toHaveBeenCalled();
  });

  it("shapes a repeat by the route's replay", async () => {
    rpcAnswers.next.set("ops_ticket", { duplicate: true, result: { user_id: ID } });
    const route = withOps(
      { schema: Body, action: "issue_login_code", company: () => ID, target: () => ({}), replay: () => ({ login: null }) },
      reached,
    );
    expect(await (await route(post())).json()).toEqual({ login: null, duplicate: true });
  });
});

describe("withOps: failures and headers", () => {
  it("maps an error thrown by the route", async () => {
    rpcAnswers.next.set("ops_ticket", { ticket: "t-1" });
    const route = withOps({ schema: Body, action: "wipe_activity", company: () => ID, target: () => ({}) }, async () => {
      throw new OpsRpcError("confirm_mismatch");
    });
    const response = await route(post());
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "confirm_mismatch" } });
  });

  it("says nothing of an unknown failure", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const route = withOps({ gate: "open" }, async () => {
      throw new Error("service key abc");
    });
    const response = await route(post(undefined));
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("abc");
    expect(errors).toHaveBeenCalled();
  });

  it("stamps every answer, a refusal too", async () => {
    const refused = await action(post(WRITE, { host: "app.test" }));
    expect(refused.headers.get("cache-control")).toBe("no-store");
    expect(refused.headers.get("x-robots-tag")).toBe("noindex");
  });
});

describe("a route without segments", () => {
  it("runs when Next hands it a context with no params", async () => {
    rpcAnswers.next.set("ops_operators", []);
    const response = await gated(get(), { params: undefined } as never);
    expect(response.status).toBe(200);
    expect(reached).toHaveBeenCalledOnce();
  });
});
