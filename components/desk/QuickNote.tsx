"use client";

import { useQueryClient } from "@tanstack/react-query";
import { BellRing, ChevronDown, NotebookPen, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Kbd } from "@/components/desk/ui/Kbd";
import { dropLayer, isTopLayer, pushLayer } from "@/components/desk/ui/layers";
import { MenuButton, type MenuItem } from "@/components/desk/ui/Menu";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { CAPTURE_ID, MIC_LABEL } from "@/components/desk/notes/Capture";
import { useDeskVoiceClaim } from "@/components/desk/voice/claim";
import { DictationMic, toastReceipt, useDeskDictationKeys } from "@/components/desk/voice/DictationMic";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { COMMAND_FIELD_ID } from "@/lib/desk/keys";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { remindPresets } from "@/lib/notes/list";
import { useCreateNote, useUpdateNote } from "@/lib/notes/mutations";
import { noteKeys } from "@/lib/notes/queries";
import { useIngestStore } from "@/lib/store/ingest";

/** The window's field always holds the caret, so its microphone has a chord, not «V». */
const VOICE_CHORD = "Alt V";
/** A field of up to this many lines grows; a longer thought scrolls inside it. */
const FIELD_MAX = 6 * 24;

/** Alt+N, by the physical key (a Russian layout presses the same «Т»). */
function isQuickKey(event: KeyboardEvent): boolean {
  return event.code === "KeyN" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat;
}

function isVoiceChord(event: KeyboardEvent): boolean {
  return event.code === "KeyV" && event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.repeat;
}

/** Where the window hangs: under the order line, in its middle, never wider than 640. */
function placeUnderLine(): { left: number; top: number; width: number } {
  const line = document.getElementById(COMMAND_FIELD_ID)?.closest<HTMLElement>(".desk-command") ?? null;
  const rect = line?.getBoundingClientRect();
  const width = Math.min(640, Math.max(480, rect ? rect.width * 0.72 : 600));
  const left = rect ? rect.left + (rect.width - width) / 2 : (window.innerWidth - width) / 2;
  return { left: Math.max(12, Math.min(left, window.innerWidth - width - 12)), top: rect ? rect.bottom + 10 : 72, width };
}

/**
 * «Мысль» from any screen of the desk (D-177): Alt+N opens a glass card under the order line —
 * the field, the microphone, «Напомнить ▾». Enter keeps the words in «Заметки» verbatim, no parser
 * (a thought that names a person stays a thought, D-75); Shift+Enter is a new line; Esc closes it
 * and keeps an unsaved draft for the next Alt+N. While it is open the desk's voice is its own
 * (D-81): the microphone and Alt+V write a thought word for word, the recording kept before any
 * AI (principle 5). On «Заметки» Alt+N puts the caret in the page's own line instead. The toast
 * «Записал в заметки · Открыть» leads to the very note. The director's desk only.
 */
export function QuickNote({ me }: { me: { userId: string; companyId: string } }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [remindAt, setRemindAt] = useState<Date | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; width: number } | null>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const create = useCreateNote(me);
  const update = useUpdateNote(me);

  useShortcuts("Мысль в заметки", [
    { keys: ["Alt N"], label: "Записать мысль с любого экрана — без разбора" },
    { keys: ["Enter"], label: "В окне мысли — сохранить в «Заметки»" },
    { keys: ["Shift Enter"], label: "В окне мысли — новая строка" },
    { keys: [VOICE_CHORD], label: "В окне мысли — сказать голосом, слово в слово" },
  ]);

  // the notes of «Заметки» never read on this desk yet: a thought written into an empty cache
  // would show as the only note there — the next visit reads them all again
  const coldRef = useRef(false);
  const settleCold = () => {
    if (!coldRef.current) return;
    coldRef.current = false;
    void queryClient.invalidateQueries({ queryKey: noteKeys.mine(me.userId) });
  };
  const noteCacheCold = () => queryClient.getQueryData(noteKeys.mine(me.userId)) === undefined;

  // ---- the voice: the window's own dictaphone while it is open ----
  const remindRef = useRef(remindAt);
  useEffect(() => {
    remindRef.current = remindAt;
  });
  const onReceipt = (receipt: Receipt) => {
    // the words of a recording already announced arrive later: the note shows them, no second toast
    if (receipt.tone === "ok" && receipt.eyebrow === "Записал") return;
    toastReceipt(receipt);
    // kept on this computer for the replay: the window's work is done
    if (receipt.eyebrow === "Нет связи") setOpen(false);
  };
  const dictation = useDictation(me, onReceipt);
  const isMine = useDeskVoiceClaim(open ? MIC_LABEL : null);
  useDeskDictationKeys(dictation, isMine);

  // the recording is in its place (Storage + the row): the window's work is done
  const stage = dictation.stage;
  const announced = useRef<string | null>(null);
  useEffect(() => {
    if (stage !== "transcribing") return;
    const id = [...dictation.busy].pop() ?? null;
    if (!id || announced.current === id) return;
    announced.current = id;
    const at = remindRef.current;
    if (at) update.mutate({ id, remind_at: at.toISOString() });
    settleCold();
    setRemindAt(null);
    setOpen(false);
    toast(at ? `Голос в заметках · напомню ${humanAqtobe(at)}` : "Голос в заметках — распознаю слова", {
      lifetimeMs: 6_000,
      action: { label: "Открыть", onClick: () => router.push(`/desk/notes?n=${id}`) },
    });
    // the hook's own state, read when it says it is transcribing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);
  useEffect(() => {
    if (stage === "saving" && noteCacheCold()) coldRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  // ---- Alt+N anywhere; Alt+V in the window ----
  const latest = useRef({ open, stage, dictation });
  useEffect(() => {
    latest.current = { open, stage, dictation };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (isQuickKey(event)) {
        // a dialog holds the desk (a confirm, the sketch): the thought waits for it to close
        if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
        event.preventDefault();
        event.stopPropagation();
        const capture = document.getElementById(CAPTURE_ID);
        if (capture && !latest.current.open) {
          capture.focus();
          return;
        }
        setOpen(true);
        requestAnimationFrame(() => field.current?.focus());
        return;
      }
      if (latest.current.open && isVoiceChord(event)) {
        event.preventDefault();
        event.stopPropagation();
        if (useIngestStore.getState().stage === "recording") return;
        const now = latest.current.stage;
        if (now === "saving" || now === "failed") return;
        latest.current.dictation.toggle();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, []);

  // ---- the window's place, its layer, Esc and a click away ----
  useLayoutEffect(() => {
    if (!open) return;
    const measure = () => setPlace(placeUnderLine());
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const layer = pushLayer();
    const esc = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !isTopLayer(layer)) return;
      // a recording takes its own Esc first (the dictaphone drops it); the next one closes
      if (latest.current.stage === "recording") return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    };
    // a click elsewhere puts an empty window away; words or a recording keep it
    const away = (event: MouseEvent) => {
      if (card.current?.contains(event.target as Node)) return;
      if ((event.target as HTMLElement | null)?.closest?.(".desk-pop")) return;
      if (field.current?.value.trim() || latest.current.stage !== "idle") return;
      setOpen(false);
    };
    window.addEventListener("keydown", esc, true);
    document.addEventListener("mousedown", away, true);
    return () => {
      dropLayer(layer);
      window.removeEventListener("keydown", esc, true);
      document.removeEventListener("mousedown", away, true);
    };
  }, [open]);

  // the field grows with the thought, up to six lines
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(FIELD_MAX, Math.max(48, node.scrollHeight))}px`;
  }, [draft, open, place]);

  const save = () => {
    const text = draft.trim();
    if (!text) return;
    const id = crypto.randomUUID();
    const at = remindAt;
    if (noteCacheCold()) coldRef.current = true;
    create.mutate({ id, text, client_request_id: crypto.randomUUID() }, { onSettled: at ? undefined : settleCold });
    // after the row, in the same queue (`scope`): the reminder is the note's own field
    if (at) update.mutate({ id, remind_at: at.toISOString() }, { onSettled: settleCold });
    setDraft("");
    setRemindAt(null);
    setOpen(false);
    toast(at ? `Записал в заметки · напомню ${humanAqtobe(at)}` : "Записал в заметки", {
      lifetimeMs: 5_000,
      action: { label: "Открыть", onClick: () => router.push(`/desk/notes?n=${id}`) },
    });
  };

  if (!open || typeof document === "undefined") return null;

  const now = new Date();
  const remindItems: MenuItem[] = [
    ...remindPresets(now).map(
      (preset): MenuItem => ({
        key: preset.label,
        label: preset.label,
        onSelect: () => {
          setRemindAt(preset.at);
          field.current?.focus();
        },
      }),
    ),
    ...(remindAt
      ? [
          "separator" as const,
          {
            key: "none",
            label: "Без напоминания",
            onSelect: () => {
              setRemindAt(null);
              field.current?.focus();
            },
          },
        ]
      : []),
  ];

  return createPortal(
    <div
      ref={card}
      role="dialog"
      aria-label="Мысль в заметки"
      className="desk-pop fixed z-[65] flex flex-col rounded-[14px] border border-border bg-surface px-4 pb-3 pt-3.5"
      style={{
        left: place?.left ?? -9999,
        top: place?.top ?? -9999,
        width: place?.width ?? 600,
        // while it listens the card wears the voice's ring (D-177): the one coloured edge on the screen
        boxShadow: stage === "recording" ? "0 0 0 1px color-mix(in srgb, var(--accent) 55%, transparent), 0 0 0 5px color-mix(in srgb, var(--accent) 10%, transparent), var(--shadow-raised)" : "var(--shadow-raised)",
        visibility: place ? "visible" : "hidden",
      }}
      data-testid="quick-note"
      data-listening={stage === "recording" ? "" : undefined}
    >
      <div className="mb-2 flex items-center gap-2 text-[12px] leading-4 text-muted">
        <NotebookPen aria-hidden size={14} strokeWidth={2} className="shrink-0" />
        <span className="font-semibold text-text">Мысль в заметки</span>
        <span className="truncate">· только вам, без разбора</span>
        <span className="ml-auto flex shrink-0 items-center gap-1">
          <Kbd>Esc</Kbd>
        </span>
      </div>
      <textarea
        ref={field}
        value={draft}
        rows={2}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.code === "NumpadEnter") && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
        placeholder={stage === "recording" ? "Говорите. Enter или клик — готово, Esc — отмена" : "Мысль — пишите, Enter сохранит"}
        aria-label="Мысль"
        spellCheck
        data-testid="quick-note-field"
        className="no-bar block w-full resize-none bg-transparent text-[16px] leading-6 text-text outline-none placeholder:text-text/45"
        style={{ caretColor: "var(--accent)", maxHeight: FIELD_MAX }}
      />
      <div className="mt-2 flex min-h-8 items-center gap-2 text-[12px] leading-4 text-muted">
        <span className="flex shrink-0 items-center gap-1">
          <Kbd>Enter</Kbd> сохранить
        </span>
        <span className="hidden shrink-0 items-center gap-1 min-[1360px]:flex">
          <Kbd>Shift Enter</Kbd> строка
        </span>
        {remindAt ? (
          <span className="ml-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] pl-2 pr-1 text-[12px] font-medium leading-4" style={{ color: "var(--warn-deep, var(--warn))", background: "color-mix(in srgb, var(--warn-ink, var(--warn)) 13%, transparent)" }} data-testid="quick-note-remind-chip">
            <BellRing aria-hidden size={13} strokeWidth={2.2} />
            напомню {humanAqtobe(remindAt, now)}
            <button type="button" aria-label="Без напоминания" onClick={() => setRemindAt(null)} className="desk-focus ml-0.5 flex h-5 w-5 items-center justify-center rounded-[6px] opacity-80 hover:opacity-100">
              <X aria-hidden size={12} strokeWidth={2.4} />
            </button>
          </span>
        ) : (
          <MenuButton
            items={remindItems}
            label="Напомнить"
            align="start"
            width={200}
            testId="quick-note-remind"
            className="desk-focus ml-1 inline-flex h-7 shrink-0 items-center gap-1 rounded-[8px] px-2 text-[12px] font-medium leading-4 text-muted transition-colors duration-[120ms] hover:bg-surface-2 hover:text-text"
          >
            <BellRing aria-hidden size={13} strokeWidth={2.2} />
            Напомнить
            <ChevronDown aria-hidden size={12} strokeWidth={2.2} />
          </MenuButton>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {stage === "idle" || stage === "transcribing" ? (
            <span className="hidden items-center gap-1 sm:flex">
              сказать <Kbd>{VOICE_CHORD}</Kbd>
            </span>
          ) : null}
          <DictationMic dictation={dictation} label={MIC_LABEL} keys={[VOICE_CHORD]} testId="quick-note-mic" />
        </span>
      </div>
    </div>,
    document.body,
  );
}
