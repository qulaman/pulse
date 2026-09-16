import { describe, expect, it } from "vitest";

import { buildLabRows, type LogRow } from "./rows";

function log(partial: Partial<LogRow> & Pick<LogRow, "id" | "kind">): LogRow {
  return {
    source: "voice",
    provider: "anthropic",
    model: "claude-haiku-4-5",
    transcript: "Марат сигареты",
    raw_response: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_tokens: null,
    stt_ms: null,
    parse_ms: null,
    status: "ok",
    client_request_id: "req-1",
    created_at: "2026-09-16T10:00:00Z",
    ...partial,
  };
}

describe("buildLabRows", () => {
  it("joins the stt row by request and prices every call of an escalated parse", () => {
    const rows = buildLabRows([
      log({
        id: "p1",
        kind: "parse",
        model: "claude-sonnet-5",
        parse_ms: 7000,
        raw_response: {
          escalated: true,
          calls: [
            {
              model: "claude-haiku-4-5",
              provider: "anthropic",
              usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
              reasoning_tokens: 0,
              latencyMs: 2500,
              ok: true,
            },
            {
              model: "claude-sonnet-5",
              provider: "anthropic",
              usage: { input_tokens: 1000, output_tokens: 200, cache_read_input_tokens: 4000, cache_creation_input_tokens: 0 },
              reasoning_tokens: 0,
              latencyMs: 6500,
              ok: true,
            },
          ],
        },
      }),
      log({
        id: "s1",
        kind: "stt",
        provider: "openai-4o",
        model: "gpt-4o-transcribe",
        stt_ms: 1800,
        raw_response: { duration_ms: 30_000 },
      }),
    ]);

    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row.stt?.model).toBe("gpt-4o-transcribe");
    expect(row.stt?.cost).toBeCloseTo(0.003, 6);
    expect(row.parse.escalated).toBe(true);
    expect(row.parse.calls.map((c) => c.model)).toEqual(["claude-haiku-4-5", "claude-sonnet-5"]);
    // haiku: 1000*1 + 200*5 + 4000*0.1 = 2400 µ$; sonnet: 1000*2 + 200*10 + 4000*0.2 = 4800 µ$
    expect(row.parse.cost).toBeCloseTo(0.0072, 6);
    expect(row.total_cost).toBeCloseTo(0.0102, 6);
  });

  it("prices a legacy row from its columns and leaves a typed input without stt", () => {
    const rows = buildLabRows([
      log({
        id: "p2",
        kind: "parse",
        source: "typed",
        client_request_id: "req-2",
        input_tokens: 500,
        output_tokens: 100,
        cache_read_tokens: 0,
        parse_ms: 2000,
      }),
    ]);
    expect(rows[0].stt).toBeNull();
    expect(rows[0].parse.calls).toHaveLength(1);
    expect(rows[0].parse.cost).toBeCloseTo(0.001, 6);
    expect(rows[0].total_cost).toBeCloseTo(0.001, 6);
  });

  it("keeps a failed parse as a row without a price", () => {
    const rows = buildLabRows([
      log({ id: "p3", kind: "parse", status: "error:parse_failed", model: "deepseek-chat", provider: "deepseek" }),
    ]);
    expect(rows[0].parse.calls).toEqual([]);
    expect(rows[0].parse.cost).toBeNull();
    expect(rows[0].total_cost).toBeNull();
  });
});
