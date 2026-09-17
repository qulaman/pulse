"use client";

import { useRef, useState, type PointerEvent as ReactPointerEvent } from "react";

import { toast } from "@/components/ui/Toast";
import { uploadPhoto } from "@/lib/files/photo";
import { haptic } from "@/lib/haptics";
import type { TaskActions } from "@/lib/tasks/mutations";
import { TEXT } from "@/lib/tasks/status-text";
import { voiceApi } from "@/lib/voice/api";
import { createRecorder, extForMime, MicUnavailableError, type Recorder } from "@/lib/voice/recorder";

/** Slide the finger this far off the microphone and the recording is forgotten. */
const CANCEL_DISTANCE_PX = 60;
/** Shorter than this is a slip of the thumb, not a message. */
const MIN_RECORDING_MS = 700;

type Props = {
  taskId: string;
  companyId: string;
  actions: TaskActions;
  /** The reply line on a card: one row, no fixed position, no keyboard handling. */
  inline?: boolean;
  /** The employee answers from a building site: the microphone comes first (D-64 §5). */
  micFirst?: boolean;
  /** Something was sent from here — the thread scrolls to the end. */
  onSent?: () => void;
};

/**
 * Writing in a thread: words, a photo, or a held microphone — the same gesture as the
 * mascot (hold to speak, release to send, slide away to forget). The recording is
 * uploaded and posted as a message BEFORE the transcript is asked for (принцип 5): if
 * STT fails the thread still holds the voice, and the words arrive later over Realtime.
 * The field is never blocked while something is sending — the row carries its own clock.
 */
export function Composer({ taskId, companyId, actions, inline = false, micFirst = false, onSent }: Props) {
  const [draft, setDraft] = useState("");
  const [recording, setRecording] = useState(false);
  const [cancelArmed, setCancelArmed] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<Recorder | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const armed = useRef(false);

  const sendText = () => {
    const text = draft.trim();
    if (!text) return;
    actions.sendMessage({ taskId, companyId, text });
    setDraft("");
    onSent?.();
  };

  const pickPhoto = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      // the photo is in Storage before the message exists — a caption without a picture
      // would be the one thing the thread could not repair
      const filePath = await uploadPhoto(file);
      actions.sendMessage({ taskId, companyId, text: draft.trim(), filePath, type: "photo" });
      setDraft("");
      onSent?.();
    } catch {
      toast(TEXT.photoFailed);
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const stopRecording = async (cancelled: boolean) => {
    const active = recorder.current;
    recorder.current = null;
    setRecording(false);
    setCancelArmed(false);
    if (!active) return;
    if (cancelled) {
      active.cancel();
      return;
    }

    let audio;
    try {
      audio = await active.stop();
    } catch {
      toast("Не записалось. Попробуй ещё раз");
      return;
    }
    if (audio.durationMs < MIN_RECORDING_MS) return;

    const requestId = crypto.randomUUID();
    const messageId = crypto.randomUUID();
    let posted = false;
    try {
      const ext = extForMime(audio.mime);
      const upload = await voiceApi.uploadUrl({ ext, context: "task_message", client_request_id: requestId });
      await voiceApi.uploadAudio({ signed_url: upload.signed_url, blob: audio.blob, mime: audio.mime });
      // the message exists the moment the audio is safe; the words are written onto it later
      actions.sendMessage({ taskId, companyId, text: "", filePath: upload.audio_path, type: "voice", id: messageId });
      posted = true;
      onSent?.();
      await voiceApi.transcribe({
        audio_path: upload.audio_path,
        context: "task_message",
        client_request_id: requestId,
        duration_ms: audio.durationMs,
        message_id: messageId,
      });
    } catch {
      // either the recording is in the thread and only the words are missing, or it never
      // left the phone — say which, never pretend it went
      toast(posted ? "Не расслышал — голосовое осталось в переписке" : "Голосовое не отправилось");
    }
  };

  const onPointerDown = async (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (recording || uploading) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    start.current = { x: event.clientX, y: event.clientY };
    armed.current = true;
    const active = createRecorder();
    try {
      await active.start();
    } catch (error) {
      armed.current = false;
      toast(error instanceof MicUnavailableError ? "Микрофон недоступен" : "Нет доступа к микрофону");
      return;
    }
    // the finger was lifted while permission was still being asked
    if (!armed.current) {
      active.cancel();
      return;
    }
    recorder.current = active;
    setRecording(true);
    haptic(15);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!recording) return;
    const dx = Math.abs(event.clientX - start.current.x);
    const dy = Math.abs(event.clientY - start.current.y);
    setCancelArmed(Math.max(dx, dy) > CANCEL_DISTANCE_PX);
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const dx = Math.abs(event.clientX - start.current.x);
    const dy = Math.abs(event.clientY - start.current.y);
    armed.current = false;
    void stopRecording(Math.max(dx, dy) > CANCEL_DISTANCE_PX);
  };

  const photoButton = (
    <button
      type="button"
      aria-label={TEXT.photoPick}
      disabled={uploading}
      onClick={() => fileInput.current?.click()}
      className="flex h-[44px] w-[40px] shrink-0 items-center justify-center rounded-[12px] text-muted transition-transform duration-[120ms] active:scale-[0.94]"
    >
      {uploading ? (
        <span className="text-[12px] leading-4">…</span>
      ) : (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
          <path d="M12 5v14M5 12h14" />
        </svg>
      )}
    </button>
  );

  const sendButton = (
    <button
      type="button"
      onClick={sendText}
      aria-label="Отправить"
      className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-accent text-bg transition-transform duration-[120ms] active:scale-[0.94]"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M4 12h15M13 6l6 6-6 6" />
      </svg>
    </button>
  );

  const voiceButton = (
    <button
      type="button"
      aria-label="Записать голосовое"
      onPointerDown={(event) => void onPointerDown(event)}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      style={{ touchAction: "none" }}
      className={`flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full transition-transform duration-[120ms] ${
        recording ? (cancelArmed ? "scale-110 bg-danger text-bg" : "scale-110 bg-accent text-bg") : "bg-surface-2 text-text"
      }`}
      data-recording={recording ? "true" : "false"}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
      </svg>
    </button>
  );

  // typing turns the microphone into «Отправить»: one place, never two buttons at once
  const voiceOrSend = draft.trim() ? sendButton : voiceButton;

  const field = (
    <textarea
      className="min-h-[44px] flex-1 field px-3 py-3 text-[16px] leading-[22px] outline-none placeholder:text-muted focus:border-accent"
      rows={1}
      placeholder={recording ? (cancelArmed ? "Отпусти — отменю" : "Говори…") : TEXT.composerPlaceholder}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) sendText();
      }}
    />
  );

  return (
    <div className={`flex items-end gap-2 ${inline ? "" : "mx-auto max-w-lg"}`} data-testid="composer">
      <input
        ref={fileInput}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        aria-label={TEXT.photoPick}
        onChange={(event) => void pickPhoto(event.target.files?.[0] ?? null)}
      />
      {/* on a site the thumb finds the microphone first; at a desk the photo does */}
      {micFirst ? voiceOrSend : photoButton}
      {field}
      {micFirst ? photoButton : voiceOrSend}
    </div>
  );
}
