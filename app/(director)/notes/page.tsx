"use client";

import { useIsMutating } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { ConvertedCard, NoteCard, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder } from "@/components/notes/NotesRecorder";
import { Tabs } from "@/components/tasks/list/Tabs";
import { TaskColumn, useAccordion, useMinute, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { NotesSkeleton } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, firstLine, groupNotes, notesHero, splitNotes, type NoteFilter, type NoteGroupKey } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { useNotes, type Note } from "@/lib/notes/queries";
import { useIngestStore } from "@/lib/store/ingest";
import type { Section } from "@/lib/tasks/overview";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** A receipt stays on the screen long enough to be read over the shoulder of a thought. */
const RECEIPT_MS = 4_000;

const EMPTY: Note[] = [];

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/**
 * «Заметки» — the director's own thoughts (D-75), in the language of «Задачи» (D-83, D-93):
 * the date and the title, a status screen that is also the recorder — how many thoughts,
 * the latest, the week; hold the microphone and talk, or type — then three tabs «Мысли /
 * В деле / Корзина» that stick under the header, and the notes as cards that open in place.
 * Nobody else ever sees this screen or these rows: privacy follows the author (D-75 §3).
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [purging, setPurging] = useState<string[] | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const searchField = useRef<HTMLInputElement>(null);

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
  useEffect(() => {
    if (searchOpen) searchField.current?.focus({ preventScroll: true });
  }, [searchOpen]);

  const dictation = useDictation(me.data, flash);

  const piles = useMemo(() => splitNotes(notes.data ?? EMPTY), [notes.data]);
  const pile = filter === "active" ? piles.active : filter === "converted" ? piles.converted : piles.trash;
  const shown = useMemo(() => filterNotes(pile, query), [pile, query]);
  const hero = useMemo(() => notesHero(piles, now), [piles, now]);
  // counts on the tabs follow the search, so a hit in another pile is visible from here
  const counts = useMemo(
    () => ({ active: filterNotes(piles.active, query).length, converted: filterNotes(piles.converted, query).length, trash: filterNotes(piles.trash, query).length }),
    [piles, query],
  );

  // the feed is filed by day (pinned first); «В деле» and the bin are one plain pile each
  const sections: Section<Note>[] = useMemo(() => {
    if (filter !== "active") return shown.length ? [{ key: filter, title: "", tone: "muted", tasks: shown }] : [];
    return groupNotes(shown, now).map((group) => ({ key: group.key, title: group.title, tone: group.key === "pinned" ? "accent" : "muted", tasks: group.notes }));
  }, [filter, shown, now]);
  const groupOf = useMemo(() => {
    const map = new Map<string, NoteGroupKey>();
    for (const section of sections) for (const note of section.tasks) map.set(note.id, section.key as NoteGroupKey);
    return map;
  }, [sections]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((note) => note.id)), [sections]);
  const accordion = useAccordion(ids, { scope: `${filter}|${query.trim()}`, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);

  // what a note became is read from the director's tasks — only while «В деле» is on screen
  const sent = useSentTasks(filter === "converted" ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (me.isLoading || notes.isLoading || !me.data) return <NotesSkeleton />;

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

  const renderCard = (note: Note) => {
    if (filter === "converted") {
      return <ConvertedCard note={note} task={note.converted_task_id ? taskById.get(note.converted_task_id) : undefined} now={now} query={query} />;
    }
    if (filter === "trash") {
      return (
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
      );
    }
    return (
      <NoteCard
        note={note}
        group={groupOf.get(note.id) ?? "today"}
        now={now}
        query={query}
        open={accordion.openId === note.id}
        busy={dictation.busy.has(note.id)}
        onToggle={() => accordion.toggle(note.id)}
        onChangeText={(text) => update.mutate({ id: note.id, text })}
        onPin={() => update.mutate({ id: note.id, pinned: !note.pinned })}
        onDelete={() => {
          accordion.toggle(note.id);
          remove.mutate({ id: note.id });
        }}
        onAssign={() => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "task")}
        onAnnounce={() => startFromNote({ id: note.id, text: note.text, audio_path: note.audio_path }, "announcement")}
        onRetranscribe={() => dictation.retranscribe(note)}
      />
    );
  };

  const empty = (
    <div className="mt-3 flex flex-col items-center rounded-[20px] border border-border/70 px-6 py-9 text-center" data-testid="notes-empty">
      <Mascot state="calm" size={64} />
      <p className="mt-4 font-display text-[17px] font-semibold">
        {query ? "Ничего не нашёл" : filter === "trash" ? "Корзина пуста" : filter === "converted" ? "Пока ничего не в деле" : "Пока пусто"}
      </p>
      <p className="mt-1 max-w-[280px] text-[14px] leading-[19px] text-muted">
        {query
          ? "Попробуйте другое слово"
          : filter === "trash"
            ? "Удалённая заметка ждёт здесь, пока её не удалят навсегда"
            : filter === "converted"
              ? "«Поручить» или «Объявить» на заметке — и она окажется здесь"
              : "Зажмите микрофон и скажите мысль — запишу слово в слово. Или напишите её"}
      </p>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-lg flex-1 px-4 pb-28 pt-3">
      <div className="flex items-end justify-between gap-3 px-0.5">
        <div className="min-w-0">
          <p className="text-[13px] font-medium leading-4 text-muted first-letter:uppercase">{DATE_LINE.format(now)}</p>
          <h1 className="mt-0.5 text-[30px] font-bold leading-[36px]">Заметки</h1>
        </div>
        <button
          type="button"
          aria-label={searchOpen ? "Закрыть поиск" : "Искать в заметках"}
          aria-pressed={searchOpen}
          data-testid="notes-search-toggle"
          onClick={() => {
            if (searchOpen) setQuery("");
            setSearchOpen((open) => !open);
          }}
          className={`mb-0.5 flex h-10 w-10 items-center justify-center rounded-full border transition-[transform,background-color,color] duration-[120ms] active:scale-95 ${
            searchOpen ? "border-accent/60 bg-accent/15 text-accent" : "border-border/80 bg-surface text-muted"
          }`}
        >
          <NoteIcon name={searchOpen ? "x" : "search"} size={18} />
        </button>
      </div>

      <div className="mt-3">
        <NotesRecorder hero={hero} receipt={receipt} dictation={dictation} writing={writing} onWrite={write} onCapture={toFeed} />
      </div>

      <Tabs
        className="mt-2"
        id="notes"
        testIdPrefix="notes-filter-"
        value={filter}
        onChange={(next) => setFilter(next)}
        items={[
          { key: "active", label: "Мысли", count: counts.active },
          { key: "converted", label: "В деле", count: counts.converted },
          { key: "trash", label: "Корзина", count: counts.trash },
        ]}
      >
        {searchOpen ? (
          <div className="mt-2 flex items-center gap-2 field px-3">
            <NoteIcon name="search" size={17} className="text-muted" />
            <input
              ref={searchField}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={filter === "trash" ? "Найти в корзине" : filter === "converted" ? "Найти в деле" : "Найти в заметках"}
              aria-label="Поиск по заметкам"
              className="min-h-[42px] min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted"
            />
            {query ? (
              <button type="button" aria-label="Очистить" onClick={() => setQuery("")} className="text-[20px] leading-none text-muted">
                ×
              </button>
            ) : null}
          </div>
        ) : null}
      </Tabs>

      {filter === "trash" && piles.trash.length > 0 ? (
        <div className="mt-1 flex min-h-[36px] items-center justify-between gap-3 px-1">
          <p className="text-[13px] leading-4 text-muted">Вернуть можно в любой момент</p>
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurging(piles.trash.map((note) => note.id))}>
            Очистить ({piles.trash.length})
          </Button>
        </div>
      ) : null}

      <div key={filter} className="card-in mt-1">
        <TaskColumn sections={sections} empty={empty} renderCard={renderCard} />
      </div>

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
