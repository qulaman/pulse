import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { guardTranscript } from "@/lib/ai/stt-guard";
import { SttError, transcribe } from "@/lib/ai/stt";
import { AuthError } from "@/lib/auth";
import { loadCompanySettings, loadRoster, vocabularyHintsFor } from "@/lib/roster";
import { createServiceSupabase } from "@/lib/supabase/service";

export const maxDuration = 60;

const BodySchema = z.strictObject({
  audio_path: z.string().min(1),
  context: z.enum(["director_input", "task_message"]),
  client_request_id: z.uuid(),
  /** Real recording length from MediaRecorder; the guard's density checks need it. */
  duration_ms: z.number().positive().optional(),
});

const MIME_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

/** ai_logs.model is not null; the STT interface reports a provider, not a model. */
const MODEL_BY_PROVIDER: Record<string, string> = {
  "openai-4o": "gpt-4o-transcribe",
  whisper1: "whisper-1",
  deepgram: "nova-3",
  elevenlabs: "scribe_v1",
};

function modelOf(provider: string | undefined): string {
  return (provider && MODEL_BY_PROVIDER[provider]) ?? "unknown";
}

export const POST = withAuth<z.infer<typeof BodySchema>>(
  "any",
  async ({ profile, body }) => {
    // Only the director's own input feeds the parser (docs/BACKEND.md §1 table).
    if (body.context === "director_input" && profile.role !== "director") {
      throw new AuthError(403, "forbidden");
    }

    // Path is the ownership proof: the bucket policies are segment-based (DATABASE.md).
    const prefix = `${profile.companyId}/${profile.userId}/`;
    if (!body.audio_path.startsWith(prefix)) {
      return apiError(403, "forbidden", "Нет доступа");
    }

    const supabase = createServiceSupabase();
    const logRow = {
      company_id: profile.companyId,
      user_id: profile.userId,
      kind: "stt" as const,
      client_request_id: body.client_request_id,
    };

    const file = await supabase.storage.from("voice").download(body.audio_path);
    if (file.error || !file.data) {
      console.error("voice download failed:", file.error?.message);
      return apiError(502, "stt_failed", "Не расслышал, попробуй ещё раз", {
        audio_path: body.audio_path,
      });
    }

    const buffer = Buffer.from(await file.data.arrayBuffer());
    const ext = body.audio_path.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext] ?? "audio/webm";

    const roster = await loadRoster(profile.companyId);
    const settings = await loadCompanySettings(profile.companyId);
    const vocabularyHints = vocabularyHintsFor(roster, settings);

    const startedAt = Date.now();
    let result;
    try {
      // No language hint: the STT gate showed "auto" beats "ru" on Kazakh speech.
      result = await transcribe(buffer, mime, { language: null, vocabularyHints });
    } catch (error) {
      const stt = error instanceof SttError ? error : undefined;
      await supabase.from("ai_logs").insert({
        ...logRow,
        provider: stt?.provider ?? "unknown",
        model: modelOf(stt?.provider),
        status: `error:${stt?.code ?? "stt_failed"}`,
        stt_ms: Date.now() - startedAt,
        latency_ms: Date.now() - startedAt,
      });
      if (!stt) throw error;
      return apiError(502, "stt_failed", "Не расслышал. Распознаю позже", {
        audio_path: body.audio_path,
      });
    }

    const sttMs = Date.now() - startedAt;
    const guard = guardTranscript({
      text: result.text,
      durationMs: body.duration_ms ?? result.durationMs,
      vocabularyHints,
    });

    if (!guard.ok) {
      await supabase.from("ai_logs").insert({
        ...logRow,
        provider: result.provider,
        model: modelOf(result.provider),
        transcript: result.text,
        status: `error:stt_guard:${guard.code}`,
        stt_ms: sttMs,
        latency_ms: sttMs,
      });
      // Claude is not called on garbage — otherwise noise becomes an announcement (AI.md §1).
      return apiOk({ transcript: null, code: "empty_transcript", guard: guard.code });
    }

    await supabase.from("ai_logs").insert({
      ...logRow,
      provider: result.provider,
      model: modelOf(result.provider),
      transcript: result.text,
      status: "ok",
      stt_ms: sttMs,
      latency_ms: sttMs,
    });

    if (body.context === "director_input") {
      await supabase
        .from("inbox_items")
        .update({ status: "transcribed", transcript: result.text })
        .eq("company_id", profile.companyId)
        .eq("client_request_id", body.client_request_id);
    }

    return apiOk({
      transcript: result.text,
      audio_path: body.audio_path,
      stt_provider: result.provider,
      latency_ms: sttMs,
      suspicious: guard.suspicious,
    });
  },
  BodySchema,
);
