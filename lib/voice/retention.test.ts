import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Database } from "@/lib/supabase/types";

import { purgeVoice } from "./retention";

type Answer = { data: unknown; error: { message: string } | null };

/** A stand-in for the service client: the two RPCs and storage.from("voice").remove. */
function fakeService(opts: {
  due: string[] | Answer;
  remove?: (paths: string[]) => Answer | Promise<Answer>;
  mark?: Answer;
}) {
  const marked: string[][] = [];
  const removed: string[][] = [];
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>): Promise<Answer> => {
    if (fn === "voice_purge_due") {
      if (Array.isArray(opts.due)) {
        return { data: opts.due.map((path) => ({ company_id: "c1", path })), error: null };
      }
      return opts.due;
    }
    if (fn === "voice_mark_purged") {
      marked.push(args.p_paths as string[]);
      return opts.mark ?? { data: (args.p_paths as string[]).length, error: null };
    }
    throw new Error(`unexpected rpc ${fn}`);
  });
  const from = vi.fn((bucket: string) => {
    expect(bucket).toBe("voice");
    return {
      remove: async (paths: string[]) => {
        removed.push(paths);
        return opts.remove ? opts.remove(paths) : { data: paths.map((name) => ({ name })), error: null };
      },
    };
  });
  const service = { rpc, storage: { from } } as unknown as SupabaseClient<Database>;
  return { service, rpc, marked, removed };
}

const paths = (n: number, prefix = "c1/u1/f") => Array.from({ length: n }, (_, i) => `${prefix}${i}.webm`);

describe("purgeVoice", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("removes the due files by the hundred and clears exactly the removed paths", async () => {
    const due = paths(250);
    const { service, marked, removed, rpc } = fakeService({ due });
    expect(await purgeVoice(service)).toBe(250);
    expect(rpc).toHaveBeenCalledWith("voice_purge_due", { p_limit: 500 });
    expect(removed.map((chunk) => chunk.length)).toEqual([100, 100, 50]);
    expect(marked).toEqual(removed);
  });

  it("a batch Storage failed keeps its paths — they come again tomorrow — and the rest still goes", async () => {
    const due = paths(5);
    const { service, marked } = fakeService({
      due,
      remove: (chunk) => (chunk.includes("c1/u1/f2.webm") ? { data: null, error: { message: "storage down" } } : { data: [], error: null }),
    });
    expect(await purgeVoice(service, { batch: 2 })).toBe(3);
    expect(marked).toEqual([["c1/u1/f0.webm", "c1/u1/f1.webm"], ["c1/u1/f4.webm"]]);
    expect(marked.flat()).not.toContain("c1/u1/f2.webm");
    expect(marked.flat()).not.toContain("c1/u1/f3.webm");
    expect(console.error).toHaveBeenCalledWith("voice remove failed:", "storage down");
  });

  it("a file already gone (no error, not in the answer) is cleared as well", async () => {
    const { service, marked } = fakeService({ due: ["c1/u1/gone.webm"], remove: () => ({ data: [], error: null }) });
    expect(await purgeVoice(service)).toBe(1);
    expect(marked).toEqual([["c1/u1/gone.webm"]]);
  });

  it("Storage throwing never breaks the sweep", async () => {
    const { service, marked } = fakeService({
      due: paths(3),
      remove: () => Promise.reject(new Error("fetch failed")),
    });
    await expect(purgeVoice(service)).resolves.toBe(0);
    expect(marked).toEqual([]);
    expect(console.error).toHaveBeenCalledWith("voice purge batch failed:", "fetch failed");
  });

  it("the list failing removes nothing", async () => {
    const { service, removed } = fakeService({ due: { data: null, error: { message: "permission denied" } } });
    await expect(purgeVoice(service)).resolves.toBe(0);
    expect(removed).toEqual([]);
  });

  it("nothing due — nothing called but the list", async () => {
    const { service, removed, rpc } = fakeService({ due: [] });
    expect(await purgeVoice(service)).toBe(0);
    expect(removed).toEqual([]);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("clearing the paths failing is logged, the removed files still count", async () => {
    const { service } = fakeService({ due: paths(2), mark: { data: null, error: { message: "timeout" } } });
    expect(await purgeVoice(service)).toBe(2);
    expect(console.error).toHaveBeenCalledWith("voice_mark_purged failed:", "timeout");
  });
});
