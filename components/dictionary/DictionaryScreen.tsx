"use client";

import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";

import { DictionaryBody } from "@/components/dictionary/DictionarySkeleton";
import { Button } from "@/components/ui/Button";
import { NamesPanel } from "@/components/dictionary/NamesPanel";
import { WordsPanel } from "@/components/dictionary/WordsPanel";
import type { RosterPerson } from "@/lib/dictionary";
import { misheardQueryKey, useCompanySettings, useWaitingEdits } from "@/lib/dictionary-queries";
import { DICTIONARY_TABS, type DictionaryTab } from "@/lib/dictionary-tabs";
import { peopleKeys, usePeople } from "@/lib/people/queries";
import { useRealtimeListener } from "@/lib/realtime/useRealtimeQuery";
import { settingsKey } from "@/lib/settings-query";
import { pluralRu } from "@/lib/tasks/status-text";
import { useMe } from "@/lib/tasks/queries";

const THUMB = { type: "spring" as const, stiffness: 520, damping: 42, mass: 0.9 };

const TITLE: Record<DictionaryTab, string> = { names: "Имена", words: "Слова" };

/**
 * «Словарь» (D-111): how the AI knows the company's people and words. Two tabs — «Имена»
 * (`profiles.aliases`) and «Слова» (`settings.vocabulary`) — each with its instructions on
 * top and edits saved on the tap. The director and the secretary (D-104); the secretary
 * sees the directors' names but does not change them.
 */
export function DictionaryScreen({ initialTab }: { initialTab: DictionaryTab }) {
  const [tab, setTab] = useState(initialTab);
  const [visited, setVisited] = useState<ReadonlySet<DictionaryTab>>(() => new Set([initialTab]));
  const people = usePeople();
  const settings = useCompanySettings();
  const me = useMe();
  const queryClient = useQueryClient();
  const waiting = useWaitingEdits();

  // The director and the secretary may have the dictionary open at once: a name one of them
  // adds shows up on the other's screen. While an own edit is in flight its settle reads the
  // list anyway — a refetch in between would briefly show it undone.
  useRealtimeListener(
    { table: "profiles", filter: me.data ? `company_id=eq.${me.data.companyId}` : undefined },
    () => {
      if (queryClient.isMutating({ mutationKey: ["dictionary", "aliases"] }) === 0) {
        void queryClient.invalidateQueries({ queryKey: peopleKeys.all });
      }
    },
    () => void queryClient.invalidateQueries({ queryKey: peopleKeys.all }),
    "dictionary-people",
    Boolean(me.data),
  );

  // Words live in company.settings, which Realtime does not carry: they are read again when
  // the screen comes back to the front — the other editor's words land by then.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      void queryClient.invalidateQueries({ queryKey: settingsKey });
      void queryClient.invalidateQueries({ queryKey: misheardQueryKey });
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [queryClient]);

  // who the pipeline can hear: the kiosk is a login, not a person, and the gone are gone (lib/roster.ts)
  const heard = useMemo(() => (people.data ?? []).filter((p) => p.is_active && p.role !== "tv"), [people.data]);
  const roster: RosterPerson[] = useMemo(
    () => heard.map((p) => ({ id: p.id, full_name: p.full_name, aliases: p.aliases })),
    [heard],
  );

  const counts: Record<DictionaryTab, number | null> = {
    names: people.data ? heard.reduce((sum, p) => sum + p.aliases.length, 0) : null,
    words: settings.data ? settings.data.vocabulary.length : null,
  };

  const select = (next: DictionaryTab) => {
    if (next === tab) return;
    setTab(next);
    setVisited((seen) => (seen.has(next) ? seen : new Set(seen).add(next)));
    // the address keeps the tab (and where «назад» leads): a reload lands on the same place
    const params = new URLSearchParams(window.location.search);
    params.set("tab", next);
    window.history.replaceState(null, "", `?${params.toString()}`);
  };

  const ready = people.data && settings.data && me.data;
  const failed = !ready && (people.isError || settings.isError || me.isError);
  const retry = () => {
    if (people.isError) void people.refetch();
    if (settings.isError) void settings.refetch();
    if (me.isError) void me.refetch();
  };

  return (
    <>
      <div role="tablist" aria-label="Разделы словаря" className="seg mt-5 flex gap-1 rounded-[14px] p-1">
        {DICTIONARY_TABS.map((key) => {
          const active = key === tab;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              id={`dictionary-tab-${key}`}
              aria-selected={active}
              aria-controls={`dictionary-panel-${key}`}
              data-testid={`dictionary-tab-${key}`}
              onClick={() => select(key)}
              className={`relative min-h-[40px] flex-1 rounded-[10px] px-2 font-display text-[15px] font-semibold leading-5 tracking-[-0.01em] transition-colors duration-[120ms] ${
                active ? "text-text" : "text-muted active:text-text"
              }`}
            >
              {active ? <motion.span layoutId="dictionary-tab" transition={THUMB} className="seg-thumb absolute inset-0 rounded-[10px]" /> : null}
              <span className="relative z-[1] flex items-center justify-center gap-1.5">
                {TITLE[key]}
                {counts[key] !== null ? <span className="nums text-[13px] font-medium text-muted">{counts[key]}</span> : null}
              </span>
            </button>
          );
        })}
      </div>

      {waiting.count ? (
        <p role="status" className="card-in mt-3 flex items-center gap-2 px-1 text-[13px] leading-[18px] text-muted">
          <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--warn)" }} />
          {waiting.count === 1
            ? "Правка ждёт связи — уйдёт сама"
            : `${waiting.count} ${pluralRu(waiting.count, ["правка ждёт", "правки ждут", "правок ждут"])} связи — уйдут сами`}
        </p>
      ) : null}

      <div className="mt-4">
        {failed ? (
          <div className="card px-4 py-6 text-center">
            <p className="text-[16px] leading-[22px]">Не получилось загрузить словарь</p>
            <p className="mt-1 text-[13px] leading-[18px] text-muted">Проверьте связь и попробуйте ещё раз</p>
            <Button variant="secondary" className="mt-4" onClick={retry}>
              Повторить
            </Button>
          </div>
        ) : !ready ? (
          <DictionaryBody />
        ) : (
          DICTIONARY_TABS.map((key) =>
            visited.has(key) ? (
              // mounted on the first visit, then only hidden: a half-typed word survives a trip to the other tab
              <section key={key} role="tabpanel" id={`dictionary-panel-${key}`} aria-labelledby={`dictionary-tab-${key}`} hidden={key !== tab}>
                {key === "names" ? (
                  <NamesPanel
                    people={heard}
                    me={{ id: me.data.userId, role: me.data.role }}
                    matching={settings.data.matching}
                  />
                ) : (
                  <WordsPanel vocabulary={settings.data.vocabulary} people={roster} />
                )}
              </section>
            ) : null,
          )
        )}
      </div>
    </>
  );
}
