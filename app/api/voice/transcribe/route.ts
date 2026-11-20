import { z } from "zod";

import { withAuth } from "@/lib/api/handler";
import { apiError, apiOk } from "@/lib/api/respond";
import { logStt } from "@/lib/ai/log";
import { guardTranscript, isOpus, isSilentOpus } from "@/lib/ai/stt-guard";
import { getSttProviders, SttError, transcribe } from "@/lib/ai/stt";
import { HINT_MAX_PEOPLE } from "@/lib/ai/hint-roster";
import { loadAssigneeCounts, loadCompanySettings, loadRoster, vocabularyHintsFor } from "@/lib/roster";
import { parseCompanySettings } from "@/lib/settings";
import { createServiceSupabase } from "@/lib/supabase/service";
import { writeNoteTranscript } from "@/lib/voice/noteText";

export const maxDuration = 60;

const BodySchema = z.strictObject({
  audio_path: z.string().min(1),
  /**
   * Only the director's own input is transcribed at all. Voice messages in a thread are
   * kept as a recording and never sent to STT (D-66) — the field stays so the contract
   * reads the same from the client and a stray `task_message` is refused, not billed.
   */
  context: z.literal("director_input"),
  client_request_id: z.uuid(),
  /** Real recording length from MediaRecorder; the guard's density checks need it. */
  duration_ms: z.number().positive().optional(),
  /** A note dictated on «Заметки»: the transcript is written onto that row (D-81). */
  note_id: z.uuid().optional(),
});

const MIME_BY_EXT: Record<string, string> = {
  webm: "audio/webm",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  ogg: "audio/ogg",
  wav: "audio/wav",
  mp3: "audio/mpeg",
};

// Only the director's own input is transcribed at all (docs/BACKEND.md §1 table).
export const POST = withAuth<z.infer<typeof BodySchema>>(
  ["director"],
  async ({ profile, body }) => {
    // Path is the ownership proof: the bucket policies are segment-based (DATABASE.md).
    const prefix = `${profile.companyId}/${profile.userId}/`;
    if (!body.audio_path.startsWith(prefix)) {
      return apiError(403, "forbidden", "Нет доступа");
    }

    const supabase = createServiceSupabase();
    const who = { company_id: profile.companyId, user_id: profile.userId, client_request_id: body.client_request_id };

    // three independent reads side by side — the director is waiting on this route (D-126)
    const [file, roster, rawSettings] = await Promise.all([
      supabase.storage.from("voice").download(body.audio_path),
      loadRoster(profile.companyId),
      loadCompanySettings(profile.companyId),
    ]);
    if (file.error || !file.data) {
      console.error("voice download failed:", file.error?.message);
      return apiError(502, "stt_failed", "Не расслышал, попробуй ещё раз", {
        audio_path: body.audio_path,
      });
    }

    const buffer = Buffer.from(await file.data.arrayBuffer());
    const ext = body.audio_path.split(".").pop()?.toLowerCase() ?? "";
    const mime = MIME_BY_EXT[ext] ?? "audio/webm";

    // a dead microphone: nothing to hear, and the recogniser would make a phrase up (AI.md §1 (з))
    if (body.duration_ms && isSilentOpus({ bytes: buffer.length, durationMs: body.duration_ms, opus: isOpus(buffer) })) {
      await logStt(supabase, who, {
        provider: "none",
        model: "none",
        status: "error:stt_guard:silent",
        raw_response: { duration_ms: body.duration_ms, bytes: buffer.length },
        ms: 0,
      });
      return apiOk({ transcript: null, code: "empty_transcript", guard: "silent" });
    }

    const settings = parseCompanySettings(rawSettings);
    // Only a large roster needs the task history to decide whom the prompt names (D-55).
    const counts = roster.length > HINT_MAX_PEOPLE ? await loadAssigneeCounts(profile.companyId) : undefined;
    const vocabularyHints = vocabularyHintsFor(roster, settings, counts);
    // Provider choice is company configuration, env is only the fallback default (V-02).
    const providers = getSttProviders({
      STT_PROVIDER: settings.stt.provider,
      STT_FALLBACK_PROVIDER: settings.stt.fallback ?? undefined,
    });

    const startedAt = Date.now();
    let result;
    try {
      // Default is no language hint: the STT gate showed "auto" beats "ru" on Kazakh speech.
      result = await transcribe(
        buffer,
        mime,
        { language: settings.stt.language === "ru" ? "ru" : null, vocabularyHints },
        providers,
      );
    } catch (error) {
      const stt = error instanceof SttError ? error : undefined;
      await logStt(supabase, who, {
        provider: stt?.provider ?? "unknown",
        status: `error:${stt?.code ?? "stt_failed"}`,
        ms: Date.now() - startedAt,
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
      await logStt(supabase, who, {
        provider: result.provider,
        transcript: result.text,
        status: `error:stt_guard:${guard.code}`,
        ms: sttMs,
      });
      // Claude is not called on garbage — otherwise noise becomes an announcement (AI.md §1).
      return apiOk({ transcript: null, code: "empty_transcript", guard: guard.code });
    }

    await logStt(supabase, who, {
      provider: result.provider,
      transcript: result.text,
      status: "ok",
      ms: sttMs,
      // STT is billed per minute of audio; the lab prices the row from this (D-63).
      raw_response: { duration_ms: body.duration_ms ?? null },
    });

    await supabase
      .from("inbox_items")
      .update({ status: "transcribed", transcript: result.text })
      .eq("company_id", profile.companyId)
      .eq("client_request_id", body.client_request_id);

    // the same for a note dictated on «Заметки» (D-81)
    if (body.note_id) {
      await writeNoteTranscript(supabase, { id: body.note_id, userId: profile.userId, audioPath: body.audio_path }, result.text);
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
