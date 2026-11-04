import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import {
  countMoved,
  deriveRequestId,
  drainStorage,
  OPS_EXPORT_TABLES,
  opsRpc,
  priceSpend,
  type OpsClient,
  type QueuedFile,
} from "./db";
import { OpsRpcError } from "./guard";

type Answer = { data?: unknown; error?: { message: string; code?: string } | null };

/** Just enough of a client: `rpc` by name, `storage.from(bucket).remove`. */
function fakeClient(rpc: (name: string, args: unknown) => Answer, remove: (bucket: string, names: string[]) => Answer) {
  const calls = { done: [] as number[][] };
  const client = {
    rpc: async (name: string, args: { p_ids?: number[] }) => {
      if (name === "ops_storage_done") calls.done.push(args.p_ids ?? []);
      return { data: null, error: null, ...rpc(name, args) };
    },
    storage: { from: (bucket: string) => ({ remove: async (names: string[]) => ({ error: null, ...remove(bucket, names) }) }) },
  };
  return { client: client as unknown as OpsClient, calls };
}

describe("opsRpc", () => {
  it("gives the data", async () => {
    const { client } = fakeClient(() => ({ data: { operator: true } }), () => ({}));
    await expect(opsRpc(client, "ops_login_state", {})).resolves.toEqual({ operator: true });
  });

  it("throws the base's own words and sqlstate", async () => {
    const { client } = fakeClient(() => ({ error: { message: "ops_denied", code: "P0001" } }), () => ({}));
    const failure = await opsRpc(client, "ops_login_state", {}).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(OpsRpcError);
    expect(failure).toMatchObject({ message: "ops_denied", sqlstate: "P0001" });
  });
});

describe("deriveRequestId", () => {
  const id = "4f6e4c0e-3a1b-4c8e-9f7a-1b2c3d4e5f60";

  it("is stable across retries of one request", () => {
    expect(deriveRequestId(id, "add_person")).toBe(deriveRequestId(id, "add_person"));
  });

  it("differs from the request and between steps", () => {
    expect(deriveRequestId(id, "add_person")).not.toBe(id);
    expect(deriveRequestId(id, "add_person")).not.toBe(deriveRequestId(id, "other"));
  });

  it("is uuid-shaped for the base", () => {
    expect(deriveRequestId(id, "add_person")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });
});

describe("priceSpend", () => {
  const row = { provider: "anthropic", model: "claude-haiku-4-5", calls: 2, input_tokens: 1_000_000, output_tokens: 0, cache_read_tokens: 0 };

  it("prices a known model", () => {
    expect(priceSpend(row).usd).toBeCloseTo(1);
  });

  it("gives null, not zero, for a model without a price or without a name", () => {
    expect(priceSpend({ ...row, model: "unknown-model" }).usd).toBeNull();
    expect(priceSpend({ ...row, model: null }).usd).toBeNull();
  });
});

describe("countMoved", () => {
  it("counts the ids the journal keeps", () => {
    expect(countMoved({ tasks: ["a", "b"], rules: [], events: ["c"], errands: ["d"] })).toEqual({
      tasks: 2,
      rules: 0,
      events: 1,
      errands_cancelled: 1,
    });
  });
});

describe("drainStorage", () => {
  const voice = (id: number): QueuedFile => ({ id, bucket: "voice", name: `v${id}` });

  it("removes bucket by bucket and clears only what went", async () => {
    let round = 0;
    const removed: string[][] = [];
    const { client, calls } = fakeClient(
      (name) => (name === "ops_storage_next" ? { data: round++ ? [] : [voice(1), { id: 2, bucket: "photos", name: "p2" }, voice(3)] } : {}),
      (bucket, names) => {
        removed.push([bucket, ...names]);
        return {};
      },
    );
    await expect(drainStorage(client, 1000)).resolves.toBe(3);
    expect(removed).toEqual([["voice", "v1", "v3"], ["photos", "p2"]]);
    expect(calls.done).toEqual([[1, 3, 2]]);
  });

  it("ends the round on a refusing bucket: the same rows would only come back", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const next = vi.fn(() => ({ data: [voice(1), { id: 2, bucket: "photos", name: "p2" }] }));
    const { client, calls } = fakeClient(next, (bucket) => (bucket === "photos" ? { error: { message: "down" } } : {}));
    await expect(drainStorage(client, 1000)).resolves.toBe(1);
    expect(calls.done).toEqual([[1]]);
    expect(next).toHaveBeenCalledTimes(2); // the one next, the one done
    errors.mockRestore();
  });

  it("never throws: the sweep goes on", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { client } = fakeClient(() => ({ error: { message: "function does not exist", code: "PGRST202" } }), () => ({}));
    await expect(drainStorage(client, 1000)).resolves.toBe(0);
    expect(errors).toHaveBeenCalled();
    errors.mockRestore();
  });

  it("stops on an empty queue at once", async () => {
    const { client } = fakeClient(() => ({ data: [] }), () => ({}));
    await expect(drainStorage(client, 1000)).resolves.toBe(0);
  });
});

describe("OPS_EXPORT_TABLES", () => {
  it("is the base's white list: `ops_export_begin` gives no list of its own", () => {
    const dir = resolve("supabase/migrations");
    const newest = readdirSync(dir)
      .sort()
      .map((file) => readFileSync(resolve(dir, file), "utf8"))
      .filter((sql) => sql.includes("function ops.export_tables()"))
      .at(-1);
    const list = newest?.match(/function ops\.export_tables\(\)[\s\S]*?array\[([\s\S]*?)\]::text\[\]/)?.[1] ?? "";
    expect([...OPS_EXPORT_TABLES].sort()).toEqual([...list.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort());
  });

  it("keeps out what is private by decision", () => {
    for (const table of ["notes", "mind_boards", "login_codes", "login_attempts", "push_subscriptions", "notification_deliveries"]) {
      expect(OPS_EXPORT_TABLES).not.toContain(table);
    }
  });
});
