"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import { NAMES_STEPS, NamesTab } from "@/components/desk/settings/dictionary/NamesTab";
import type { NamesFilter } from "@/components/desk/settings/dictionary/NamesTable";
import { GuideButton } from "@/components/desk/settings/dictionary/parts";
import { WORDS_STEPS, WordsTab, type WordsFilter } from "@/components/desk/settings/dictionary/WordsTab";
import { usePageSearch } from "@/components/desk/settings/SettingsFrame";
import { EmptyState } from "@/components/desk/ui/EmptyState";
import { PageTitle } from "@/components/desk/ui/PageTitle";
import { useShortcuts } from "@/components/desk/ui/Shortcuts";
import { SearchField, SegmentTabs, Select, Toolbar } from "@/components/desk/ui/Toolbar";
import { Button } from "@/components/ui/Button";
import { Bone } from "@/components/ui/Skeleton";
import { isPlainKey, isTypingTarget } from "@/lib/desk/keys";
import { nameReport, NO_KIND_LABEL, type RosterPerson } from "@/lib/dictionary";
import { misheardQueryKey, useCompanySettings, useWaitingEdits, wordStatsKey } from "@/lib/dictionary-queries";
import type { DictionaryTab } from "@/lib/dictionary-tabs";
import { canEditPerson } from "@/lib/people/access";
import { peopleKeys, usePeople } from "@/lib/people/queries";
import { useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import { settingsKey } from "@/lib/settings-query";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

/** The tab's place while the dictionary loads: the check's strip, then the table's rows with their faces and chips. */
function Loading() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Bone h={92} />
      <div className="dict-bone desk-grid desk-list">
        {Array.from({ length: 7 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 px-3 py-3">
            <Bone round w={30} h={30} />
            <Bone h={14} w={160} />
            <Bone h={24} w={index % 2 ? 180 : 120} className="ml-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * «Словарь» on the desk (D-111, D-154 wave 3): how the AI knows the company's people and words, as
 * two tables under one toolbar — «Имена» (`profiles.aliases`) and «Слова» (`settings.vocabulary`) —
 * with what helps on the right. Edits are saved at once, as on the phone, through the same hooks;
 * the director and the secretary (D-104) may have it open together — names come by Realtime, words
 * when the screen comes back to the front. 1/2 switch the tab, Ctrl+F the search, N a new word.
 */
export function DictionaryDesk({ initialTab }: { initialTab: DictionaryTab }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<DictionaryTab>>(() => new Set([initialTab]));
  const [query, setQuery] = useState("");
  const [namesFilter, setNamesFilter] = useState<NamesFilter>("all");
  const [wordsFilter, setWordsFilter] = useState<WordsFilter>("all");
  const people = usePeople();
  const settings = useCompanySettings();
  const me = useMe();
  const queryClient = useQueryClient();
  const waiting = useWaitingEdits();
  const search = useRef<HTMLInputElement>(null);
  const addWord = useRef<HTMLInputElement>(null);
  usePageSearch(search);

  // a name the other editor adds shows up here; an own edit in flight is not refetched under itself
  useRealtimeListener(
    { table: "profiles", filter: me.data ? `company_id=eq.${me.data.companyId}` : undefined },
    () => {
      if (queryClient.isMutating({ mutationKey: ["dictionary", "aliases"] }) === 0) void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
    },
    () => void queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
    "desk-dictionary-people",
    Boolean(me.data),
  );
  // words live in company.settings, which Realtime does not carry: read again when the window comes back
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({ queryKey: settingsKey });
      void queryClient.invalidateQueries({ queryKey: misheardQueryKey });
      void queryClient.invalidateQueries({ queryKey: wordStatsKey });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);

  const heard = useMemo(() => (people.data ?? []).filter((p) => p.is_active && p.role !== "tv"), [people.data]);
  const roster: RosterPerson[] = useMemo(() => heard.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })), [heard]);
  const who = me.data ? { id: me.data.userId, role: me.data.role } : null;
  const counts = useMemo(() => {
    const reports = new Map(roster.map((p) => [p.id, nameReport(p, roster)]));
    const editable = (id: string, role: (typeof heard)[number]["role"]) => (who ? canEditPerson(who, { id, role }) : false);
    return {
      suggest: heard.filter((p) => editable(p.id, p.role) && reports.get(p.id)?.suggestions.length).length,
      shared: heard.filter((p) => reports.get(p.id)?.shared.length).length,
    };
    // `who` is rebuilt every render from `me.data`; its parts are what matter
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heard, roster, me.data?.userId, me.data?.role]);

  const select = (next: DictionaryTab) => {
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    setQuery("");
    // the address keeps the tab: a reload lands on the same place
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  // 1/2 — the tabs; N — the new word's field (on «Слова»)
  const latest = useRef({ select, tab });
  useEffect(() => {
    latest.current = { select, tab };
  });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || !isPlainKey(event) || event.shiftKey || isTypingTarget(event.target)) return;
      if (document.body.hasAttribute("data-dialog-open") || document.body.hasAttribute("data-sheet-open")) return;
      if (event.code === "Digit1" || event.code === "Digit2") {
        event.preventDefault();
        latest.current.select(event.code === "Digit1" ? "names" : "words");
      } else if (event.code === "KeyN" && latest.current.tab === "words") {
        event.preventDefault();
        addWord.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useShortcuts(
    "Словарь",
    tab === "names"
      ? [
          { keys: ["1", "2"], label: "Имена · Слова" },
          { keys: ["↑ ↓"], label: "Выбрать человека (в таблице)" },
          { keys: ["Enter"], label: "Добавить имя выбранному" },
          { keys: ["A"], label: "Принять подсказки выбранного" },
          { keys: ["Esc"], label: "Закрыть поле имени" },
        ]
      : [
          { keys: ["1", "2"], label: "Имена · Слова" },
          { keys: ["N"], label: "Новое слово" },
          { keys: ["↑ ↓"], label: "Выбрать слово (в таблице)" },
          { keys: ["Enter", "F2"], label: "Исправить написание" },
          { keys: ["Del"], label: "Удалить слово (можно вернуть)" },
        ],
  );

  const ready = people.data && settings.data && me.data && who;
  const failed = !ready && (people.isError || settings.isError || me.isError);
  const names = heard.reduce((sum, p) => sum + p.aliases.length, 0);
  const words = settings.data?.vocabulary.length ?? 0;
  const kinds = settings.data?.word_kinds ?? [];

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <PageTitle
        title="Словарь"
        state={
          waiting.count
            ? { text: waiting.count === 1 ? "Правка ждёт связи — уйдёт сама" : `${waiting.count} ${pluralRu(waiting.count, ["правка ждёт", "правки ждут", "правок ждут"])} связи — уйдут сами` }
            : { text: "как ИИ слышит людей и слова компании · сохраняется сразу" }
        }
        // the rules of the open tab one click away, on the head: the toolbar keeps its line for the work
        actions={<GuideButton steps={tab === "names" ? NAMES_STEPS : WORDS_STEPS} />}
      />
      <Toolbar
        end={
          <SearchField
            ref={search}
            value={query}
            onChange={setQuery}
            placeholder={tab === "names" ? "Имя, должность, как зовут" : "Найти слово"}
            aria-label={tab === "names" ? "Поиск по людям" : "Поиск по словарю"}
            width={240}
          />
        }
      >
        <SegmentTabs
          aria-label="Разделы словаря"
          value={tab}
          onChange={select}
          items={[
            { value: "names", label: <span data-testid="dictionary-tab-names">Имена</span>, count: people.data ? names : undefined },
            { value: "words", label: <span data-testid="dictionary-tab-words">Слова</span>, count: settings.data ? words : undefined },
          ]}
        />
        <span aria-hidden className="mr-3 h-4 w-px bg-border" />
        {tab === "names" ? (
          <SegmentTabs
            aria-label="Кого показать"
            value={namesFilter}
            onChange={setNamesFilter}
            items={[
              { value: "all", label: "Все", count: heard.length || undefined },
              { value: "suggest", label: "Можно дополнить", count: counts.suggest || undefined },
              { value: "shared", label: "Одно имя на двоих", count: counts.shared || undefined },
            ]}
          />
        ) : (
          <Select aria-label="Тип слов" value={wordsFilter} onChange={(event) => setWordsFilter(event.target.value as WordsFilter)} className="w-[200px]">
            <option value="all">Все типы</option>
            {kinds.map((k) => (
              <option key={k.id} value={`kind:${k.id}`}>
                {k.label}
              </option>
            ))}
            <option value="none">{NO_KIND_LABEL}</option>
            <option value="stale">Не встречались 30 дней</option>
          </Select>
        )}
      </Toolbar>

      {failed ? (
        <EmptyState
          title="Не получилось загрузить словарь"
          hint="Проверьте связь и попробуйте ещё раз"
          action={
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (people.isError) void people.refetch();
                if (settings.isError) void settings.refetch();
                if (me.isError) void me.refetch();
              }}
            >
              Повторить
            </Button>
          }
        />
      ) : !ready ? (
        <Loading />
      ) : (
        <>
          {/* mounted on the first visit, then only hidden: a half-typed word survives a trip to the other tab */}
          {visited.has("names") ? (
            <section id="dictionary-panel-names" hidden={tab !== "names"} aria-label="Имена">
              <NamesTab people={heard} me={who} matching={settings.data.matching} query={tab === "names" ? query : ""} filter={namesFilter} />
            </section>
          ) : null}
          {visited.has("words") ? (
            <section id="dictionary-panel-words" hidden={tab !== "words"} aria-label="Слова">
              <WordsTab
                vocabulary={settings.data.vocabulary}
                meta={settings.data.vocabulary_meta}
                kinds={settings.data.word_kinds}
                people={roster}
                query={tab === "words" ? query : ""}
                filter={wordsFilter}
                addRef={addWord}
              />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
