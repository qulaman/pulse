import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "@/lib/supabase/types";

import { sttModelOf } from "./stt-providers";

/** Whose recording it was: the row's company, its author and the phrase's key. */
export type SttLogWho = { company_id: string; user_id: string; client_request_id: string };

export type SttLogEntry = {
  provider: string;
  /** ai_logs.model is not null; by default the provider's own model (`sttModelOf`). */
  model?: string;
  /** `ok`, or `error:<code>` — `error:stt_guard:<rule>` when the guard threw the words away. */
  status: string;
  /** The time STT took: both `stt_ms` and `latency_ms` of the row. */
  ms: number;
  transcript?: string;
  raw_response?: Json;
};

/** One STT attempt in ai_logs (kind `stt`) under the service role; a failed write is not the caller's failure. */
export async function logStt(service: SupabaseClient<Database>, who: SttLogWho, entry: SttLogEntry): Promise<void> {
  const { ms, model, ...rest } = entry;
  await service.from("ai_logs").insert({
    ...who,
    kind: "stt",
    ...rest,
    model: model ?? sttModelOf(entry.provider),
    stt_ms: ms,
    latency_ms: ms,
  });
}
