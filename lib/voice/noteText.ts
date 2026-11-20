import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/supabase/types";

/**
 * The words of a note dictated on «Заметки» (D-81). The row with the recording is born before
 * STT, so a closed tab or a lost response cannot leave the thought without its words. Narrowed
 * to the caller's note and this very recording; the text is filled only while it is still empty
 * — the director may have typed into it meanwhile — and the raw transcript is kept either way.
 * Never throws: a failed write is logged, the transcript still goes back to the phone.
 */
export async function writeNoteTranscript(
  service: SupabaseClient<Database>,
  note: { id: string; userId: string; audioPath: string },
  text: string,
): Promise<void> {
  const filled = await service
    .from("notes")
    .update({ text, raw_transcript: text })
    .eq("id", note.id)
    .eq("user_id", note.userId)
    .eq("audio_path", note.audioPath)
    .eq("text", "")
    .select("id");
  if (filled.error) {
    console.error("note transcript write failed:", filled.error.message);
    return;
  }
  if (filled.data.length > 0) return;
  const raw = await service
    .from("notes")
    .update({ raw_transcript: text })
    .eq("id", note.id)
    .eq("user_id", note.userId)
    .eq("audio_path", note.audioPath);
  if (raw.error) console.error("note raw transcript write failed:", raw.error.message);
}
