"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { ConvertedCard, NoteCard, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { NotesDevice } from "@/components/notes/NotesDevice";
import { Button } from "@/components/ui/Button";
import device from "@/components/ui/device/device.module.css";
import { NotesSkeleton } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, firstLine, groupNotes, notesSummary, splitNotes, type NoteFilter } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { useIngestStore } from "@/lib/store/ingest";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** A receipt stays on the display long enough to be read over the shoulder of a thought. */
const RECEIPT_MS = 4_000;

const EMPTY: Note[] = [];

/** Groups say «Сегодня» and the display says «последняя …»: a minute is fine enough. */
function useMinute(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

/**
 * «Заметки» — the director's own thoughts (D-75), on the device of the director's
 * screens (D-80 §1, D-81). Nobody else ever sees this screen or these rows: privacy
 * follows the author, not the org chart.
 *
 * The head is a dictaphone: hold the key and talk, or tap it and talk until the next
 * tap — the words land verbatim, no parser and no «запиши мысль». Typing goes into the
 * well next to it. Below: the feed filed by day with pinned on top, «В деле» — what the
 * notes became and how that is doing — and the bin, where a delete can still be undone.
 */
export default function NotesPage() {
  const me = useMe();
  const notes = useNotes(me.data?.userId);
  const create = useCreateNote(me.data);
  const update = useUpdateNote(me.data);
  const remove = useDeleteNote(me.data);
  const restore = useRestoreNote(me.data);
  const purge = usePurgeNotes(me.data);
  const startFromNote = useIngestStore((state) => state.startFromNote);
  const writing = useIsMutating({ mutationKey: ["notes"] }) > 0;
  const now = useMinute();

  const [filter, setFilter] = useState<NoteFilter>("active");
  const [query, setQuery] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [purging, setPurging] = useState<string[] | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);

  const receiptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = useCallback((next: Receipt) => {
    if (receiptTimer.current) clearTimeout(receiptTimer.current);
    setReceipt(next);
    receiptTimer.current = setTimeout(() => setReceipt(null), RECEIPT_MS);
  }, []);
  useEffect(
    () => () => {
      if (receiptTimer.current) clearTimeout(receiptTimer.current);
    },
    [],
  );

  const dictation = useDictation(me.data, flash);

  const piles = useMemo(() => splitNotes(notes.data ?? EMPTY), [notes.data]);
  const pile = filter === "active" ? piles.active : filter === "converted" ? piles.converted : piles.trash;
  const shown = useMemo(() => filterNotes(pile, query), [pile, query]);
  const groups = useMemo(() => (filter === "active" ? groupNotes(shown, now) : []), [filter, shown, now]);

  // what a note became is read from the director's tasks — only while «В деле» is on screen
  const sent = useSentTasks(filter === "converted" ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (me.isLoading || notes.isLoading || !me.data) return <NotesSkeleton />;

  const counts = { active: piles.active.length, converted: piles.converted.length, trash: piles.trash.length };
  const summary = notesSummary(piles, filter, now);

  // a new thought goes to the feed, and the feed is shown whole
  const toFeed = () => {
    setFilter("active");
    setQuery("");
  };

  const write = (text: string) => {
    toFeed();
    create.mutate({ id: crypto.randomUUID(), text, client_request_id: crypto.randomUUID() });
    flash({ tone: "ok", eyebrow: "Записал", headline: firstLine(text), line: "Сохранено" });
  };

  const choose = (next: NoteFilter) => {
    setFilter(next);
    setOpenId(null);
  };

  const cardProps = (note: Note, group: Parameters<typeof NoteCard>[0]["group"]) => ({
    note,
    group,
    now,
    query,
    open: openId === note.id,
    busy: dictation.busy.has(note.id),
    onToggle: () => setOpenId((id) => (id === note.id ? null : note.id)),
    onChangeText: (text: string) => update.mutate({ id: note.id, text }),
    onPin: () => update.mutate({ id: note.id, pinned: !note.pinned }),
    onDelete: () => {
      setOpenId(null);
      remove.mutate({ id: note.id });
    },
    onAssign: () => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "task"),
    onAnnounce: () => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "announcement"),
    onRetranscribe: () => dictation.retranscribe(note),
  });

  const empty = shown.length === 0;

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-36 pt-3">
      <h1 className="sr-only">Заметки</h1>

      <NotesDevice
        summary={summary}
        receipt={receipt}
        dictation={dictation}
        writing={writing}
        filter={filter}
        counts={counts}
        onFilter={choose}
        onWrite={write}
        onCapture={toFeed}
      />

      <p className="mt-2 text-center text-[12px] leading-4 text-muted">Приватно · видны только автору</p>

      {pile.length > 0 || query ? (
        // a hairline, not a filled box — the same search row as «Задачи»
        <label className="mt-3 flex min-h-[44px] items-center gap-2 rounded-[12px] border border-border/70 px-3 transition-colors duration-[120ms] focus-within:border-accent/60">
          <NoteIcon name="search" className="text-muted" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={filter === "trash" ? "Найти в корзине" : filter === "converted" ? "Найти в деле" : "Найти в заметках"}
            aria-label="Поиск по заметкам"
            // the browser's own clear cross would stand next to ours
            className="min-w-0 flex-1 bg-transparent text-[16px] leading-[22px] text-text outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:appearance-none"
          />
          {query ? (
            <span className="nums shrink-0 text-[12px] leading-4 text-muted">{shown.length}</span>
          ) : null}
          {query ? (
            <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="flex h-8 w-8 items-center justify-center text-muted">
              <NoteIcon name="x" size={14} />
            </button>
          ) : null}
        </label>
      ) : null}

      {filter === "trash" && piles.trash.length > 0 ? (
        <div className="mt-3 flex min-h-[36px] items-center justify-between gap-3">
          <p className="text-[13px] leading-4 text-muted">Вернуть можно в любой момент</p>
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurging(piles.trash.map((note) => note.id))}>
            Очистить ({piles.trash.length})
          </Button>
        </div>
      ) : null}

      {empty ? (
        <div className="mt-5 flex flex-col items-center card px-6 py-9 text-center" data-testid="notes-empty">
          <Mascot state="calm" size={64} />
          <p className="mt-4 text-[16px] leading-[22px]">
            {query ? "Ничего не нашёл" : filter === "trash" ? "Корзина пуста" : filter === "converted" ? "Пока ничего не в деле" : "Пока пусто"}
          </p>
          <p className="mt-1 max-w-[280px] text-[13px] leading-[18px] text-muted">
            {query
              ? "Попробуй другое слово"
              : filter === "trash"
                ? "Удалённая заметка ждёт здесь, пока её не удалят навсегда"
                : filter === "converted"
                  ? "«Поручить» или «Объявить» на заметке — и она окажется здесь"
                  : "Нажми микрофон на пульте и скажи мысль — запишу слово в слово. Или напиши её"}
          </p>
        </div>
      ) : filter === "active" ? (
        // one flat list of labels and cards: a card that changes group (pinned) is moved
        // by React, not remounted — the editor keeps its state and nothing fades in again
        <div className="mt-4 flex flex-col gap-2.5">
          {groups.flatMap((group, index) => [
            <h2
              key={`group-${group.key}`}
              data-group={group.key}
              className={`${device.print} flex items-center justify-between px-1 ${index > 0 ? "mt-4" : ""}`}
            >
              <span>{group.title}</span>
              <span className="nums">{group.notes.length}</span>
            </h2>,
            ...group.notes.map((note) => (
              <div key={note.id} className="card-in">
                <NoteCard {...cardProps(note, group.key)} />
              </div>
            )),
          ])}
        </div>
      ) : filter === "converted" ? (
        <div className="mt-4 flex flex-col gap-2.5">
          {shown.map((note) => (
            <div key={note.id} className="card-in">
              <ConvertedCard note={note} task={note.converted_task_id ? taskById.get(note.converted_task_id) : undefined} now={now} query={query} />
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2.5">
          {shown.map((note) => (
            <div key={note.id} className="card-in">
              <TrashCard
                note={note}
                now={now}
                query={query}
                onRestore={() => {
                  restore.mutate({ id: note.id });
                  toast("Вернул в мысли");
                }}
                onPurge={() => setPurging([note.id])}
              />
            </div>
          ))}
        </div>
      )}

      <Sheet open={purging !== null} onClose={() => setPurging(null)} title={purging && purging.length > 1 ? "Очистить корзину" : "Удалить навсегда"}>
        <p className="text-[16px] leading-[22px] text-muted">
          {purging && purging.length > 1
            ? `${purging.length} ${pluralRu(purging.length, ["заметка исчезнет", "заметки исчезнут", "заметок исчезнут"])} вместе с текстом. Вернуть будет нельзя.`
            : "Заметка исчезнет вместе с текстом. Вернуть будет нельзя."}
        </p>
        <div className="mt-4 flex gap-2">
          <Button
            variant="danger"
            block
            data-testid="notes-purge-confirm"
            onClick={() => {
              if (purging) purge.mutate({ ids: purging });
              setPurging(null);
            }}
          >
            Удалить
          </Button>
          <Button variant="secondary" block onClick={() => setPurging(null)}>
            Не сейчас
          </Button>
        </div>
      </Sheet>
    </main>
  );
}
