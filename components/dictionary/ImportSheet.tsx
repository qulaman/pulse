"use client";

import { useState } from "react";

import { KindPicker } from "@/components/dictionary/KindPicker";
import { Button } from "@/components/ui/Button";
import { Sheet } from "@/components/ui/Sheet";
import { VOCABULARY_MAX, classifyWords, type RosterPerson, type WordKind, type WordKindDef, type WordLine } from "@/lib/dictionary";
import { pluralRu } from "@/lib/tasks/status-text";

const VERDICT: Record<WordLine["verdict"], { text: (line: WordLine) => string; tone: string }> = {
  new: { text: () => "новое", tone: "var(--ok)" },
  similar: { text: (l) => `похоже на «${l.to}»`, tone: "var(--warn)" },
  existing: { text: () => "уже есть", tone: "var(--text-muted)" },
  name: { text: (l) => `имя: ${l.to}`, tone: "var(--text-muted)" },
  too_long: { text: () => "длиннее 60 знаков", tone: "var(--text-muted)" },
  overflow: { text: () => `сверх ${VOCABULARY_MAX}`, tone: "var(--text-muted)" },
};

/** Lines a tick can take: a new word and a look-alike the director may still want. */
const PICKABLE = new Set<WordLine["verdict"]>(["new", "similar"]);

/**
 * A pasted list, before anything is added (D-111, words wave): one line per entry with
 * what it is to the vocabulary — new, like a word already there, already there, a person's
 * name. New ones come ticked, look-alikes not; the rest cannot be ticked. One kind for all,
 * «Добавить N» adds the ticked ones. Nothing lands without this tap.
 */
export function ImportSheet({
  text,
  vocabulary,
  people,
  kinds,
  kind,
  onClose,
  onAdd,
}: {
  kinds: readonly WordKindDef[];
  /** The pasted text; null — the sheet is closed. */
  text: string | null;
  vocabulary: readonly string[];
  people: readonly RosterPerson[];
  kind: WordKind | null;
  onClose: () => void;
  onAdd: (words: string[], kind: WordKind | null) => void;
}) {
  return (
    <Sheet open={text !== null} onClose={onClose} title="Добавить списком">
      {text !== null ? (
        <ImportBody key={text} text={text} vocabulary={vocabulary} people={people} kinds={kinds} kind={kind} onAdd={onAdd} />
      ) : null}
    </Sheet>
  );
}

function ImportBody({
  text,
  vocabulary,
  people,
  kinds,
  kind: initialKind,
  onAdd,
}: {
  kinds: readonly WordKindDef[];
  text: string;
  vocabulary: readonly string[];
  people: readonly RosterPerson[];
  kind: WordKind | null;
  onAdd: (words: string[], kind: WordKind | null) => void;
}) {
  // the lines are read once: the preview does not reshuffle under the finger
  const [lines] = useState(() => classifyWords(vocabulary, text, people));
  const [ticked, setTicked] = useState<ReadonlySet<number>>(
    () => new Set(lines.flatMap((line, index) => (line.verdict === "new" ? [index] : []))),
  );
  const [kind, setKind] = useState(initialKind);
  const chosen = lines.filter((_, index) => ticked.has(index)).map((line) => line.entry);
  const room = VOCABULARY_MAX - vocabulary.length;
  const toggle = (index: number) =>
    setTicked((seen) => {
      const next = new Set(seen);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  return (
    <div className="flex flex-col gap-3" data-testid="import-sheet">
      <p className="text-[13px] leading-[18px] text-muted">
        {lines.length} {pluralRu(lines.length, ["строка", "строки", "строк"])} · новые отмечены, похожие на то, что уже есть, — нет
      </p>
      <ul className="no-bar -mx-1 max-h-[46dvh] overflow-y-auto">
        {lines.map((line, index) => {
          const pickable = PICKABLE.has(line.verdict);
          const on = ticked.has(index);
          const verdict = VERDICT[line.verdict];
          return (
            <li key={`${line.entry}-${index}`}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                disabled={!pickable}
                onClick={() => toggle(index)}
                className="flex min-h-[48px] w-full items-center gap-3 rounded-[10px] px-1 text-left transition-colors duration-[120ms] active:bg-surface-2 disabled:active:bg-transparent"
              >
                <span
                  aria-hidden
                  className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[7px] border transition-colors duration-[120ms]"
                  style={
                    on
                      ? { background: "var(--accent)", borderColor: "var(--accent)", color: "var(--bg)" }
                      : { borderColor: pickable ? "var(--border)" : "transparent", opacity: pickable ? 1 : 0.4 }
                  }
                >
                  {on ? (
                    <svg width="13" height="13" viewBox="0 0 16 16">
                      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : null}
                </span>
                <span className={`min-w-0 flex-1 truncate text-[16px] leading-[22px] ${pickable ? "" : "text-muted"}`}>{line.entry}</span>
                <span className="max-w-[48%] shrink-0 truncate text-right text-[13px] leading-4" style={{ color: verdict.tone }}>
                  {verdict.text(line)}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-2 border-t border-border/70 pt-3">
        <span className="text-[13px] leading-4 text-muted">Тип для всех</span>
        <KindPicker kinds={kinds} value={kind} onChange={setKind} />
      </div>
      {chosen.length > room ? (
        <p className="text-[13px] leading-[18px] text-warn">Места осталось на {room} — снимите лишние отметки</p>
      ) : null}
      <Button
        block
        size="lg"
        disabled={chosen.length === 0 || chosen.length > room}
        onClick={() => onAdd(chosen, kind)}
      >
        {chosen.length ? `Добавить ${chosen.length}` : "Ничего не отмечено"}
      </Button>
    </div>
  );
}
