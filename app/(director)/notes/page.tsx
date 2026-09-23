"use client";

import { onlineManager, useIsMutating } from "@tanstack/react-query";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";

import { Mascot } from "@/components/brand/Mascot";
import { ConvertedCard, NoteCard, PendingCard, TrashCard } from "@/components/notes/NoteCard";
import { NoteIcon } from "@/components/notes/icons";
import { NotesRecorder } from "@/components/notes/NotesRecorder";
import { RemindSheet } from "@/components/notes/RemindSheet";
import { Tabs } from "@/components/tasks/list/Tabs";
import { TaskColumn, useAccordion, useMinute, useRevealOpen } from "@/components/tasks/list/TaskList";
import { Button } from "@/components/ui/Button";
import { NotesSkeleton } from "@/components/ui/PageSkeletons";
import { Sheet } from "@/components/ui/Sheet";
import { toast } from "@/components/ui/Toast";
import { humanAqtobe } from "@/lib/ai/time";
import { useDictation, type Receipt } from "@/lib/notes/dictation";
import { filterNotes, firstLine, groupNotes, notesHero, splitNotes, TRASH_DAYS, type NoteFilter, type NoteGroupKey } from "@/lib/notes/list";
import { useCreateNote, useDeleteNote, usePurgeNotes, useRestoreNote, useUpdateNote } from "@/lib/notes/mutations";
import { dropCreate, type PendingCreate } from "@/lib/notes/pending";
import { useNoteCounts, useNotes, useNoteSearch, useOlderNotes, type Note } from "@/lib/notes/queries";
import { usePendingNotes, useReplayHearing } from "@/lib/notes/replay";
import { useIngestStore } from "@/lib/store/ingest";
import type { Section } from "@/lib/tasks/overview";
import { useMe, useSentTasks } from "@/lib/tasks/queries";
import { pluralRu } from "@/lib/tasks/status-text";

/** A receipt stays on the screen long enough to be read over the shoulder of a thought. */
const RECEIPT_MS = 4_000;

const EMPTY: Note[] = [];

/** An edit younger than this is simply on its way; older, with the network up, it is stuck. */
const STUCK_MS = 20_000;

const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(onChange);
const isOnline = () => onlineManager.isOnline();

const DATE_LINE = new Intl.DateTimeFormat("ru-RU", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Aqtobe" });

/** A note that exists only on the phone yet, drawn as a row of the feed (D-95). */
function phoneRow(entry: PendingCreate): Note {
  return {
    id: entry.id,
    company_id: entry.companyId,
    user_id: entry.userId,
    text: entry.text,
    raw_transcript: null,
    audio_path: null,
    inbox_item_id: null,
    pinned: false,
    converted_task_id: null,
    converted_announcement_id: null,
    converted_at: null,
    deleted_at: null,
    remind_at: null,
    reminded_at: null,
    client_request_id: entry.crid,
    created_at: entry.createdAt,
    updated_at: entry.createdAt,
  };
}

/**
 * «Заметки» — the director's own thoughts (D-75), in the language of «Задачи» (D-83, D-93):
 * the date and the title, a status screen that is also the recorder — how many thoughts,
 * the latest, the week; hold the microphone and talk, or type — then three tabs «Мысли /
 * В деле / Корзина» that stick under the header, and the notes as cards that open in place.
 * Reminders ring from here (D-95), a thought without network waits on the phone and shows
 * as «ждёт связи», older notes come by «Показать раньше», the bin keeps three days.
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
  const [reminding, setReminding] = useState<Note | null>(null);
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

  // what the server holds past the loaded feed: the numbers, «Показать раньше», the search
  const serverCounts = useNoteCounts(me.data?.userId);
  const older = useOlderNotes(me.data?.userId);
  const cached = notes.data ?? EMPTY;
  const loadedLive = useMemo(() => cached.filter((note) => note.deleted_at === null).length, [cached]);
  const hasOlder = (serverCounts.data?.live ?? 0) > loadedLive;
  const search = useNoteSearch(me.data?.userId, query, hasOlder);
  const pending = usePendingNotes(me.data?.userId);
  const hearing = useReplayHearing();
  const online = useSyncExternalStore(subscribeOnline, isOnline, () => true);

  // the feed as the director should see it: the cache, older hits of the search, edits still
  // on the phone laid over their rows, and notes that exist only on the phone so far (D-95)
  const { rows, phoneOnly, waiting } = useMemo(() => {
    const byId = new Map(cached.map((note) => [note.id, note]));
    for (const hit of search.data ?? []) if (!byId.has(hit.id)) byId.set(hit.id, hit);
    for (const edit of pending.edits) {
      const row = byId.get(edit.id);
      if (row) byId.set(edit.id, { ...row, ...edit.fields, ...("remind_at" in edit.fields ? { reminded_at: null } : {}) });
    }
    const phone = new Map<string, PendingCreate>();
    for (const entry of pending.creates) {
      if (byId.has(entry.id)) continue;
      phone.set(entry.id, entry);
      byId.set(entry.id, phoneRow(entry));
    }
    // «ждёт связи» on a card: with no network, or when a write has been stuck for a while —
    // not for the second an ordinary autosave is on its way
    const late = (at: number) => !online || now.getTime() - at > STUCK_MS;
    return {
      rows: [...byId.values()],
      phoneOnly: phone,
      waiting: new Set([
        ...pending.creates.filter((entry) => late(Date.parse(entry.createdAt))).map((entry) => entry.id),
        ...pending.edits.filter((edit) => late(edit.at)).map((edit) => edit.id),
      ]),
    };
  }, [cached, search.data, pending, online, now]);

  const piles = useMemo(() => splitNotes(rows, now), [rows, now]);
  const pile = filter === "active" ? piles.active : filter === "converted" ? piles.converted : piles.trash;
  const shown = useMemo(() => filterNotes(pile, query), [pile, query]);
  const hero = useMemo(() => notesHero(piles, now, serverCounts.data?.thoughts), [piles, now, serverCounts.data]);
  // counts on the tabs follow the search, so a hit in another pile is visible from here;
  // without a search they are the server's — the feed may hold only the latest months
  const counts = useMemo(() => {
    if (query.trim()) {
      return { active: filterNotes(piles.active, query).length, converted: filterNotes(piles.converted, query).length, trash: filterNotes(piles.trash, query).length };
    }
    const server = serverCounts.data;
    return {
      active: Math.max(piles.active.length, server?.thoughts ?? 0),
      converted: Math.max(piles.converted.length, server?.converted ?? 0),
      trash: piles.trash.length,
    };
  }, [piles, query, serverCounts.data]);

  // the feed is filed by day (reminders, then pinned first); «В деле» and the bin are one plain pile each
  const sections: Section<Note>[] = useMemo(() => {
    if (filter !== "active") return shown.length ? [{ key: filter, title: "", tone: "muted", tasks: shown }] : [];
    return groupNotes(shown, now).map((group) => ({
      key: group.key,
      title: group.title,
      tone: group.key === "pinned" || group.key === "reminders" ? "accent" : "muted",
      tasks: group.notes,
    }));
  }, [filter, shown, now]);
  const groupOf = useMemo(() => {
    const map = new Map<string, NoteGroupKey>();
    for (const section of sections) for (const note of section.tasks) map.set(note.id, section.key as NoteGroupKey);
    return map;
  }, [sections]);

  const ids = useMemo(() => sections.flatMap((section) => section.tasks.map((note) => note.id)), [sections]);
  const accordion = useAccordion(ids, { scope: `${filter}|${query.trim()}`, autoOpen: false });
  useRevealOpen(accordion.openId, accordion.userTouched);

  // a reminder's push opens /notes?n=<id>: that note opens in place once the feed is here
  const params = useSearchParams();
  const [linked, setLinked] = useState<string | null>(() => params.get("n"));
  if (linked && notes.data) {
    setLinked(null);
    if (filter !== "active") setFilter("active");
    accordion.focus(linked);
  }

  // what a note became is read from the director's tasks — only while «В деле» is on screen
  const sent = useSentTasks(filter === "converted" ? me.data?.userId : undefined);
  const taskById = useMemo(() => new Map((sent.data ?? []).map((task) => [task.id, task])), [sent.data]);

  if (me.isLoading || notes.isLoading || !me.data) return <NotesSkeleton />;

  // a new thought goes to the feed, and the feed is shown whole
  const toFeed = () => {
    setFilter("active");
    setQuery("");
  };

  const remind = (note: Note, iso: string | null) => {
    update.mutate({ id: note.id, remind_at: iso });
    toast(iso ? `Напомню ${humanAqtobe(new Date(iso), new Date())}` : "Напоминание снято");
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
    const phone = phoneOnly.get(note.id);
    if (phone) {
      return <PendingCard note={note} voiced={phone.audio !== null} now={now} onDiscard={() => void dropCreate(note.id)} />;
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
        busy={dictation.busy.has(note.id) || hearing.has(note.id)}
        offline={waiting.has(note.id)}
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
        onRemind={() => setReminding(note)}
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
            ? `Удалённая заметка ждёт здесь ${TRASH_DAYS} дня, потом исчезнет сама`
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
          <p className="text-[13px] leading-4 text-muted">Хранится {TRASH_DAYS} дня, потом исчезнет</p>
          <Button variant="ghost" size="sm" className="!text-danger/80" onClick={() => setPurging(piles.trash.map((note) => note.id))}>
            Очистить ({piles.trash.length})
          </Button>
        </div>
      ) : null}

      <div key={filter} className="card-in mt-1">
        <TaskColumn sections={sections} empty={empty} renderCard={renderCard} />
      </div>

      {/* the feed holds the latest months; the rest is one tap away, and the search reaches it anyway */}
      {filter !== "trash" && hasOlder ? (
        query.trim() ? (
          <p className="mt-3 px-1 text-center text-[13px] leading-4 text-muted" data-testid="notes-search-older">
            {search.isFetching ? "Ищу и в старых заметках…" : "Искал и в старых заметках"}
          </p>
        ) : (
          <div className="mt-3">
            <Button variant="secondary" block loading={older.isPending} data-testid="notes-older" onClick={() => older.mutate()}>
              Показать раньше
            </Button>
          </div>
        )
      ) : null}

      <RemindSheet
        open={reminding !== null}
        onClose={() => setReminding(null)}
        currentIso={reminding?.remind_at ?? null}
        onPick={(iso) => {
          if (reminding) remind(reminding, iso);
        }}
      />

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
