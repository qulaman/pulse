"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

import { DictationMic } from "@/components/desk/voice/DictationMic";
import type { Dictation } from "@/lib/notes/dictation";

import { KeyWord } from "./NoteList";

/** The id Alt+N looks for (the shell's quick thought, D-177): on «Заметки» it focuses this field. */
export const CAPTURE_ID = "desk-notes-capture";
/** What was typed and not saved yet survives a reload of this tab — never another browser. */
const DRAFT_KEY = "pulse.desk.notes.draft";
/** The field grows with the thought up to this many pixels, then scrolls. */
const MAX_HEIGHT = 200;

export const MIC_LABEL = "Сказать мысль — слово в слово";

function readDraft(): string {
  try {
    return sessionStorage.getItem(DRAFT_KEY) ?? "";
  } catch {
    return "";
  }
}

function keepDraft(text: string) {
  try {
    if (text) sessionStorage.setItem(DRAFT_KEY, text);
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // a private window: the draft lives as long as the page
  }
}

/**
 * The capture card on top of the stream (D-177): a thought is written here and saved verbatim by
 * Enter — no parser, no empty row before the first character; the caret stays for the next one,
 * Shift+Enter makes a line. Not focused by itself (the page's single keys must keep working): N
 * or a click brings the caret. The microphone beside it is the page's dictaphone (V).
 */
export function Capture({
  onSave,
  dictation,
  summary,
  disabled,
}: {
  /** Saves the words; `restore` puts them back into the card if the server refused them for good. */
  onSave: (text: string, restore: (text: string) => void) => void;
  dictation: Dictation;
  summary: string | null;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const listening = dictation.stage === "recording";

  // the draft of this tab comes back after hydration (the server renders an empty field)
  useEffect(() => {
    const kept = readDraft();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- browser storage is read once, after hydration
    if (kept) setText(kept);
  }, []);

  // as tall as the thought, within reason
  useLayoutEffect(() => {
    const node = field.current;
    if (!node) return;
    node.style.height = "auto";
    node.style.height = `${Math.min(MAX_HEIGHT, node.scrollHeight)}px`;
  }, [text]);

  const change = (next: string) => {
    setText(next);
    keepDraft(next);
  };

  const save = () => {
    if (!text.trim() || disabled) return;
    onSave(text, (lost) => {
      setText((now) => {
        const back = now.trim() ? `${lost}\n${now}` : lost;
        keepDraft(back);
        return back;
      });
    });
    change("");
  };

  return (
    <div className="nb-capture" data-listening={listening ? "" : undefined} data-testid="desk-notes-capture-card">
      <div className="nb-capture-head">
        {listening ? (
          <>
            <span className="nb-capture-title nb-capture-live">Слушаю</span>
            <span className="nb-capture-sub">голос сохраняется сразу — слова придут следом</span>
          </>
        ) : (
          <>
            <span className="nb-capture-title">Новая мысль</span>
            <span className="nb-capture-sub">слово в слово, без разбора</span>
          </>
        )}
        {summary && !listening ? <span className="nb-capture-count nums">{summary}</span> : null}
      </div>
      <textarea
        ref={field}
        id={CAPTURE_ID}
        value={text}
        onChange={(event) => change(event.target.value)}
        onKeyDown={(event) => {
          if ((event.key === "Enter" || event.code === "NumpadEnter") && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey && !event.nativeEvent.isComposing) {
            event.preventDefault();
            save();
          }
        }}
        rows={1}
        spellCheck
        disabled={disabled}
        aria-label="Новая мысль"
        placeholder={listening ? "Говорите. Enter или клик — готово" : "Мысль — пишите, Enter сохранит"}
        data-testid="desk-notes-capture"
        data-update-safe
        className="nb-capture-field no-bar"
      />
      <div className="nb-capture-foot">
        {listening ? (
          <KeyWord k="Esc">отмена</KeyWord>
        ) : (
          <>
            <KeyWord k="Enter">сохранить</KeyWord>
            <KeyWord k="Shift Enter">строка</KeyWord>
          </>
        )}
        <span className="ml-auto flex items-center gap-2">
          {listening ? null : <KeyWord k="V">сказать</KeyWord>}
          <DictationMic dictation={dictation} label={MIC_LABEL} testId="desk-notes-mic" />
        </span>
      </div>
    </div>
  );
}
