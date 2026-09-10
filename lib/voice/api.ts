import type { PostprocessedEntity } from "../ai/postprocess";
import type { Entity } from "../ai/schema";

/**
 * Typed client for the four voice-pipeline routes (docs/BACKEND.md §2).
 * Every failure — HTTP, malformed body or a dead network — surfaces as VoiceApiError
 * with a code from docs/AI.md §11, so the store never has to inspect a Response.
 */

export type IngestSource = "voice" | "typed" | "shared";
export type AudioExt = "webm" | "m4a" | "mp4";
export type UploadContext = "director_input" | "task_message";

export type UploadUrlResponse = {
  audio_path: string;
  signed_url: string;
  token: string;
};

export type TranscribeResponse = {
  transcript: string;
  audio_path: string;
  stt_provider: string;
  latency_ms: number;
  /** inbox_items row that carries the recording through the pipeline (DATABASE.md). */
  inbox_id?: string | null;
  /** Guard verdict: transcript is usable but smells off (docs/AI.md §1). */
  suspicious?: boolean;
};

export type ParseResponse = {
  entities: PostprocessedEntity[];
  transcript?: string;
  inbox_id?: string | null;
  suspicious?: boolean;
};

export type ConfirmRequest = {
  client_request_id: string;
  source: IngestSource;
  audio_path: string | null;
  transcript: string;
  parsed_entities: Entity[];
  confirmed_entities: Entity[];
  /** D-38: override of the 08:00–21:00 delivery window, set by an explicit tap. */
  force_now?: boolean;
};

export type ConfirmResponse = {
  result: Record<string, unknown>;
  duplicate: boolean;
};

export class VoiceApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body: unknown;

  constructor(code: string, status: number, body: unknown) {
    super(`voice api ${code} (${status})`);
    this.name = "VoiceApiError";
    this.code = code;
    this.status = status;
    this.body = body;
  }
}

function errorCodeOf(body: unknown, status: number): string {
  const error = (body as { error?: { code?: unknown } } | null)?.error;
  if (error && typeof error.code === "string") return error.code;
  if (status === 504) return "ai_timeout";
  if (status === 429) return "rate_limited";
  return "unknown";
}

async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

async function post<T>(path: string, payload: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new VoiceApiError("network", 0, cause);
  }

  const body = await readJson(res);
  if (!res.ok) throw new VoiceApiError(errorCodeOf(body, res.status), res.status, body);
  return body as T;
}

export interface VoiceApi {
  uploadUrl(input: { ext: AudioExt; context: UploadContext }): Promise<UploadUrlResponse>;
  uploadAudio(input: { signed_url: string; blob: Blob; mime: string }): Promise<void>;
  transcribe(input: {
    audio_path: string;
    context: UploadContext;
    client_request_id: string;
  }): Promise<TranscribeResponse>;
  parse(input: {
    transcript: string;
    audio_path: string | null;
    source: IngestSource;
    client_request_id: string;
  }): Promise<ParseResponse>;
  confirm(input: ConfirmRequest): Promise<ConfirmResponse>;
}

export const voiceApi: VoiceApi = {
  uploadUrl: (input) => post<UploadUrlResponse>("/api/voice/upload-url", input),

  /** Straight to Storage by signed URL — the 4.5 MB Vercel body limit never applies (G.8). */
  async uploadAudio({ signed_url, blob, mime }) {
    let res: Response;
    try {
      res = await fetch(signed_url, {
        method: "PUT",
        headers: { "content-type": mime, "x-upsert": "false" },
        body: blob,
      });
    } catch (cause) {
      throw new VoiceApiError("network", 0, cause);
    }
    if (!res.ok) throw new VoiceApiError("upload_failed", res.status, await readJson(res));
  },

  transcribe: (input) => post<TranscribeResponse>("/api/voice/transcribe", input),
  parse: (input) => post<ParseResponse>("/api/voice/parse", input),
  confirm: (input) => post<ConfirmResponse>("/api/voice/confirm", input),
};
