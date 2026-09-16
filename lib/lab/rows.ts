import type { ParseCall } from "@/lib/ai/parse";
import { MODEL_PRICES, STT_PRICE_PER_MINUTE, parseCost, sttCost } from "@/lib/ai/pricing";
import type { CompanySettings } from "@/lib/settings";
import type { Json } from "@/lib/supabase/types";

/**
 * The lab's view of ai_logs (D-63): one row per director recognition, the STT row
 * joined by client_request_id, every model call priced on its own so an escalated
 * parse shows both bills.
 */

export interface LabCall {
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  reasoning_tokens: number;
  latency_ms: number;
  ok: boolean;
  cost: number | null;
}

export interface LabRow {
  id: string;
  created_at: string;
  client_request_id: string | null;
  source: string | null;
  transcript: string | null;
  status: string;
  stt: {
    provider: string;
    model: string;
    duration_ms: number | null;
    stt_ms: number | null;
    cost: number | null;
  } | null;
  parse: {
    model: string;
    provider: string;
    escalated: boolean;
    parse_ms: number | null;
    calls: LabCall[];
    cost: number | null;
  };
  total_cost: number | null;
}

export interface LabResponse {
  settings: { stt: CompanySettings["stt"]; parser: CompanySettings["parser"] };
  rows: LabRow[];
  prices: { models: typeof MODEL_PRICES; stt_per_minute: typeof STT_PRICE_PER_MINUTE };
}

export type LogRow = {
  id: string;
  kind: "stt" | "parse" | "query";
  source: string | null;
  provider: string;
  model: string;
  transcript: string | null;
  raw_response: Json | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  stt_ms: number | null;
  parse_ms: number | null;
  status: string;
  client_request_id: string | null;
  created_at: string;
};

export const LAB_ROW_LIMIT = 60;

function asRecord(value: Json | null | undefined): Record<string, Json | undefined> {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function num(value: Json | undefined): number {
  return typeof value === "number" ? value : 0;
}

function toLabCall(call: ParseCall): LabCall {
  return {
    model: call.model,
    provider: call.provider,
    input_tokens: call.usage.input_tokens,
    output_tokens: call.usage.output_tokens,
    cache_read_tokens: call.usage.cache_read_input_tokens,
    cache_write_tokens: call.usage.cache_creation_input_tokens,
    reasoning_tokens: call.reasoning_tokens,
    latency_ms: call.latencyMs,
    ok: call.ok,
    cost: call.ok ? parseCost(call.model, call.usage) : 0,
  };
}

/** Rows written before the per-call list existed carry one model in the columns. */
function callsOf(row: LogRow): LabCall[] {
  const raw = asRecord(row.raw_response);
  if (Array.isArray(raw.calls) && raw.calls.length > 0) {
    return (raw.calls as unknown as ParseCall[]).map(toLabCall);
  }
  if (row.status !== "ok") return [];
  const usage = {
    input_tokens: row.input_tokens ?? 0,
    output_tokens: row.output_tokens ?? 0,
    cache_read_input_tokens: row.cache_read_tokens ?? 0,
    cache_creation_input_tokens: num(asRecord(raw.usage).cache_creation_input_tokens),
  };
  return [
    {
      model: row.model,
      provider: row.provider,
      input_tokens: usage.input_tokens,
      output_tokens: usage.output_tokens,
      cache_read_tokens: usage.cache_read_input_tokens,
      cache_write_tokens: usage.cache_creation_input_tokens,
      reasoning_tokens: 0,
      latency_ms: row.parse_ms ?? 0,
      ok: true,
      cost: parseCost(row.model, usage),
    },
  ];
}

function sumCosts(values: (number | null)[]): number | null {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? known.reduce((a, b) => a + b, 0) : null;
}

/** `logs` newest first; the first stt row per request is the one that counts. */
export function buildLabRows(logs: LogRow[], limit = LAB_ROW_LIMIT): LabRow[] {
  const sttByRequest = new Map<string, LogRow>();
  for (const row of logs) {
    if (row.kind === "stt" && row.client_request_id && !sttByRequest.has(row.client_request_id)) {
      sttByRequest.set(row.client_request_id, row);
    }
  }

  const rows: LabRow[] = [];
  for (const row of logs) {
    if (row.kind !== "parse") continue;
    const stt = row.client_request_id ? sttByRequest.get(row.client_request_id) : undefined;
    const duration = stt ? asRecord(stt.raw_response).duration_ms : undefined;
    const durationMs = typeof duration === "number" ? duration : null;
    const sttInfo = stt
      ? {
          provider: stt.provider,
          model: stt.model,
          duration_ms: durationMs,
          stt_ms: stt.stt_ms,
          cost: sttCost(stt.provider, durationMs),
        }
      : null;
    const calls = callsOf(row);
    const parseTotal = sumCosts(calls.map((c) => c.cost));
    rows.push({
      id: row.id,
      created_at: row.created_at,
      client_request_id: row.client_request_id,
      source: row.source,
      transcript: row.transcript,
      status: row.status,
      stt: sttInfo,
      parse: {
        model: row.model,
        provider: row.provider,
        escalated: asRecord(row.raw_response).escalated === true,
        parse_ms: row.parse_ms,
        calls,
        cost: parseTotal,
      },
      total_cost: sumCosts([sttInfo?.cost ?? null, parseTotal]),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}
